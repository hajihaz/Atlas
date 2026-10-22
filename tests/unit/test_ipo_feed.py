"""Regression tests for licensed-source-friendly, read-only IPO feed and fail-closed semantics."""
import importlib.util
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch
import unittest

MODULE = Path(__file__).resolve().parents[2] / 'scripts/update_ipo_feed.py'
spec = importlib.util.spec_from_file_location('ipo_feed',MODULE)
ipo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipo)

class IpoFeedTests(unittest.TestCase):
    def test_mandate_time_is_source_derived(self):
        self.assertEqual(ipo.parse_mandate_deadline('23-Oct-2026 (upto 5:00 PM)'), '2026-10-23T17:00:00+05:30')
        self.assertIsNone(ipo.parse_mandate_deadline('end of day'))
    def test_valid_mainboard(self):
        row={'symbol':'HELLO','companyName':'Example Industries','series':'EQ','issueStartDate':'21-Oct-2026','issueEndDate':'23-Oct-2026','issuePrice':'Rs.120 to Rs.135','status':'Active'}
        out=ipo.transform_issue(row)
        self.assertEqual(out['board'],'MAINBOARD')
        self.assertEqual((out['priceMin'],out['priceMax']),(120,135))
        self.assertIsNone(out['gmp'])
        self.assertIsNone(out['mandateDeadline'])
    def test_sme_never_assumed_retail(self):
        row={'symbol':'SMEIPO','companyName':'Example SME','series':'SME','issueStartDate':'21-Oct-2026','issueEndDate':'24-Oct-2026','issuePrice':'Rs.200','status':'Forthcoming'}
        out=ipo.transform_issue(row)
        self.assertEqual(out['board'],'SME')
        self.assertIsNone(out['lotSize'])
        self.assertIsNone(out['subscription']['retail'])
    def test_invalid_issue_ignored(self):
        self.assertIsNone(ipo.transform_issue({'symbol':'<script>','companyName':'Fake'}))
        self.assertIsNone(ipo.date_iso('not a date'))
        self.assertEqual(ipo.price_band('not published'),(None,None))
    def test_subscription_categories(self):
        values=ipo.summary_categories([{'category':'Qualified Institutional Buyers(QIBs)','noOfTime':'2.4'}, {'category':'Total','noOfTime':'7.2'}])
        self.assertEqual(values['qib'],2.4)
        self.assertIsNone(values['retail'])
        self.assertEqual(values['total'],7.2)
    def test_bse_sme_filters_historical_and_rights_issues(self):
        fixture='<table id="ContentPlaceHolder1_tblID"><tr><td><a href="https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?id=1&type=IPO&idtype=2&IPONo=12">Example SME</a></td><td>23-10-2026</td><td>26-10-2026</td><td>95.00 - 100.00</td></tr><tr><td><a href="https://www.bseindia.com/markets/publicIssues/DisplayIPO.aspx?id=3&type=RI&IPONo=13">Rights issue</a></td><td>23-10-2026</td><td>26-10-2026</td><td>90.00</td></tr></table>'
        rows=ipo.recent_bse_sme(now=date(2026,10,23),html_text=fixture)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['board'],'SME')
        self.assertEqual(rows[0]['status'],'OPEN')
        self.assertEqual(rows[0]['id'],'BSESME-12')
    def test_provider_failure_does_not_erase_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'ipo-feed.json'
            output.write_text('{"preserve":true}',encoding='utf8')
            with patch.object(ipo,'get_json',side_effect=ValueError('source changed')):
                code=ipo.main_with_output(output) if hasattr(ipo,'main_with_output') else None
                self.assertIsNone(code)
                with self.assertRaises(ValueError):ipo.build_snapshot()
            self.assertEqual(output.read_text(encoding='utf8'),'{"preserve":true}')

if __name__=='__main__':unittest.main()
