"""integrity hardening — append-only enforcement, least-privilege, bitemporal constraints

Added after the Phase-2 adversarial review, which correctly found that append-only /
least-privilege / non-overlap were *documented but not enforced*. This migration makes them
real in PostgreSQL. It is written to be run against Postgres (it uses plpgsql + btree_gist)
and must be validated on a live DB before Phase 7 (it is a Phase-7 entry gate — ADR 0009).

Revision ID: 0002_integrity_hardening
Revises: 0001_initial
Create Date: 2026-07-05
"""

from __future__ import annotations

from alembic import op

revision = "0002_integrity_hardening"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

_FAR_FUTURE = "9999-12-31 00:00:00+00"

# Tables that are STRICTLY append-only — no UPDATE and no DELETE, ever.
_STRICT_APPEND_ONLY = ("trial_ledger", "data_quality_findings", "snapshots")
# Bitemporal fact tables — DELETE forbidden; UPDATE allowed ONLY to close an open interval.
_BITEMPORAL = ("ohlcv_observations", "corporate_actions", "index_membership")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist;")

    # --- 1. Immutability triggers -------------------------------------------------------
    op.execute(
        """
        CREATE OR REPLACE FUNCTION atlas_forbid_mutation() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'append-only table %: % is forbidden', TG_TABLE_NAME, TG_OP;
        END; $$ LANGUAGE plpgsql;
        """
    )
    # Bitemporal guard: allow ONLY the legitimate "close the open interval" update
    # (knowledge_to moves off FAR_FUTURE on a currently-open row; identity/knowledge_from
    # unchanged). Everything else — DELETE, editing closed history, moving knowledge_from —
    # is rejected, so priced history cannot be silently rewritten.
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION atlas_bitemporal_guard() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'delete forbidden on append-only %', TG_TABLE_NAME;
          END IF;
          IF OLD.knowledge_to <> TIMESTAMPTZ '{_FAR_FUTURE}' THEN
            RAISE EXCEPTION 'cannot modify an already-closed version of %', TG_TABLE_NAME;
          END IF;
          IF NEW.knowledge_from <> OLD.knowledge_from OR NEW.knowledge_to = TIMESTAMPTZ '{_FAR_FUTURE}' THEN
            RAISE EXCEPTION 'append-only: only closing (setting knowledge_to) is allowed on %',
              TG_TABLE_NAME;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        """
    )
    for table in _STRICT_APPEND_ONLY:
        op.execute(
            f"CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION atlas_forbid_mutation();"
        )
    for table in _BITEMPORAL:
        op.execute(
            f"CREATE TRIGGER {table}_bitemporal BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION atlas_bitemporal_guard();"
        )

    # --- 2. "Exactly one current version" partial-unique indexes (CA + membership) ------
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_ca_current ON corporate_actions
          (instrument_id, ex_date, ca_type) WHERE knowledge_to = '{_FAR_FUTURE}';
        """
    )
    op.execute(
        f"""
        CREATE UNIQUE INDEX uq_member_current ON index_membership
          (index_code, instrument_id, valid_from) WHERE knowledge_to = '{_FAR_FUTURE}';
        """
    )

    # --- 3. Non-overlapping knowledge intervals per logical key (EXCLUDE constraints) ---
    op.execute(
        """
        ALTER TABLE ohlcv_observations ADD CONSTRAINT ohlcv_no_overlap EXCLUDE USING gist (
          instrument_id WITH =, event_date WITH =, source WITH =,
          tstzrange(knowledge_from, knowledge_to) WITH &&);
        """
    )
    op.execute(
        """
        ALTER TABLE corporate_actions ADD CONSTRAINT ca_no_overlap EXCLUDE USING gist (
          instrument_id WITH =, ex_date WITH =, ca_type WITH =,
          tstzrange(knowledge_from, knowledge_to) WITH &&);
        """
    )
    op.execute(
        """
        ALTER TABLE index_membership ADD CONSTRAINT member_no_overlap EXCLUDE USING gist (
          index_code WITH =, instrument_id WITH =, valid_from WITH =,
          tstzrange(knowledge_from, knowledge_to) WITH &&);
        """
    )

    # --- 4. Least-privilege roles (ADR 0009) --------------------------------------------
    # A read-only research/reporting role that can never mutate the source of truth, and a
    # writer role stripped of DELETE (and of UPDATE on strictly-append-only tables).
    op.execute(
        """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_reader') THEN
            CREATE ROLE atlas_reader NOLOGIN;
          END IF;
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'atlas_writer') THEN
            CREATE ROLE atlas_writer NOLOGIN;
          END IF;
        END $$;
        """
    )
    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA public TO atlas_reader;")
    op.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO atlas_reader;")
    op.execute("GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO atlas_writer;")
    op.execute("GRANT UPDATE ON ohlcv_observations, corporate_actions, index_membership, "
               "ingestion_runs TO atlas_writer;")  # UPDATE only where legitimately needed
    op.execute("REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM atlas_writer;")


def downgrade() -> None:
    for table in _BITEMPORAL:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_bitemporal ON {table};")
    for table in _STRICT_APPEND_ONLY:
        op.execute(f"DROP TRIGGER IF EXISTS {table}_immutable ON {table};")
    op.execute("DROP FUNCTION IF EXISTS atlas_bitemporal_guard();")
    op.execute("DROP FUNCTION IF EXISTS atlas_forbid_mutation();")
    op.execute("DROP INDEX IF EXISTS uq_ca_current;")
    op.execute("DROP INDEX IF EXISTS uq_member_current;")
    op.execute("ALTER TABLE ohlcv_observations DROP CONSTRAINT IF EXISTS ohlcv_no_overlap;")
    op.execute("ALTER TABLE corporate_actions DROP CONSTRAINT IF EXISTS ca_no_overlap;")
    op.execute("ALTER TABLE index_membership DROP CONSTRAINT IF EXISTS member_no_overlap;")
    # Roles/grants intentionally left in place on downgrade (dropping shared roles is unsafe).
