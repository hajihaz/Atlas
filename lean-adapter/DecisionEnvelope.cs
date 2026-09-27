using System.Text.Json;
using System.Text.Json.Serialization;

namespace Atlas.Lean.Adapter;

public sealed record DecisionItem(
    [property: JsonPropertyName("instrument_id")] string InstrumentId,
    [property: JsonPropertyName("target_weight")] string TargetWeight);

public sealed record DecisionEnvelope(
    [property: JsonPropertyName("contract")] string Contract,
    [property: JsonPropertyName("strategy_config_id")] string StrategyConfigId,
    [property: JsonPropertyName("strategy_name")] string StrategyName,
    [property: JsonPropertyName("strategy_version")] string StrategyVersion,
    [property: JsonPropertyName("decision_date")] DateOnly DecisionDate,
    [property: JsonPropertyName("effective_date")] DateOnly EffectiveDate,
    [property: JsonPropertyName("execution_model")] string ExecutionModel,
    [property: JsonPropertyName("snapshot_id")] string SnapshotId,
    [property: JsonPropertyName("evidence_hash")] string EvidenceHash,
    [property: JsonPropertyName("decisions")] IReadOnlyList<DecisionItem> Decisions);

public static class DecisionEnvelopeReader
{
    private const string Contract = "atlas.lean.decision.v1";

    public static DecisionEnvelope Read(string json)
    {
        var envelope = JsonSerializer.Deserialize<DecisionEnvelope>(json)
            ?? throw new InvalidDataException("Decision envelope is empty or invalid.");
        Validate(envelope);
        return envelope;
    }

    private static void Validate(DecisionEnvelope e)
    {
        if (e.Contract != Contract) throw new InvalidDataException("Unsupported Atlas decision contract.");
        if (e.EffectiveDate <= e.DecisionDate) throw new InvalidDataException("Effective date must be after decision date.");
        if (string.IsNullOrWhiteSpace(e.StrategyConfigId) || string.IsNullOrWhiteSpace(e.SnapshotId) || string.IsNullOrWhiteSpace(e.EvidenceHash))
            throw new InvalidDataException("Decision provenance identifiers are required.");
        if (e.Decisions.Select(x => x.InstrumentId).Distinct(StringComparer.Ordinal).Count() != e.Decisions.Count)
            throw new InvalidDataException("Duplicate instrument in decision envelope.");
        foreach (var item in e.Decisions)
            if (string.IsNullOrWhiteSpace(item.InstrumentId) || !decimal.TryParse(item.TargetWeight, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var weight))
                throw new InvalidDataException("Every target weight must be a finite invariant decimal.");
    }
}
