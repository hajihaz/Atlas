using System;
using System.Collections.Generic;
using QuantConnect;
using QuantConnect.Algorithm;
using QuantConnect.Data;
using QuantConnect.Orders;
using QuantConnect.Orders.Fills;
using QuantConnect.Securities;

namespace QuantConnect.Algorithm.CSharp;

/// <summary>
/// Atlas deterministic broker-like partial fill model, for test infrastructure only.
/// Twelve shares fill at most four shares per daily bar; never connects to a broker.
/// </summary>
public sealed class AtlasPartialFillFixtureAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private bool _submitted;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 18);
        SetCash(100000m);
        var security = AddEquity("SPY", Resolution.Daily);
        _spy = security.Symbol;
        security.SetFillModel(new AtlasPartialFillModel());
    }

    public override void OnData(Slice data)
    {
        if (_submitted || !data.Bars.ContainsKey(_spy)) return;
        _submitted = true;
        MarketOrder(_spy, 12, asynchronous: true);
        Debug("ATLAS_PARTIAL_FILL submitted_12_shares");
    }

    private sealed class AtlasPartialFillModel : FillModel
    {
        private readonly Dictionary<int, decimal> _remaining = new();

        public override OrderEvent MarketFill(Security asset, MarketOrder order)
        {
            return CapFill(order, base.MarketFill(asset, order));
        }

        public override OrderEvent MarketOnOpenFill(Security asset, MarketOnOpenOrder order)
        {
            return CapFill(order, base.MarketOnOpenFill(asset, order));
        }

        private OrderEvent CapFill(Order order, OrderEvent fill)
        {
            if (fill.FillQuantity == 0m) return fill;
            var remaining = _remaining.TryGetValue(order.Id, out var old)
                ? old : order.AbsoluteQuantity;
            var quantity = Math.Min(4m, remaining);
            fill.FillQuantity = Math.Sign(order.Quantity) * quantity;
            if (quantity == remaining)
            {
                fill.Status = OrderStatus.Filled;
                _remaining.Remove(order.Id);
            }
            else
            {
                fill.Status = OrderStatus.PartiallyFilled;
                _remaining[order.Id] = remaining - quantity;
            }
            return fill;
        }
    }
}
