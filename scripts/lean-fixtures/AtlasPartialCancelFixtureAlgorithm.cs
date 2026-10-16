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
/// Archival LEAN partial market fill then cancel of the outstanding balance.
/// No brokerage, credentials, network endpoint or live execution is used.
/// </summary>
public sealed class AtlasPartialCancelFixtureAlgorithm : QCAlgorithm
{
    private Symbol _spy = null!;
    private OrderTicket? _ticket;
    private int _sessions;

    public override void Initialize()
    {
        SetStartDate(2013, 10, 8);
        SetEndDate(2013, 10, 18);
        SetCash(100000m);
        var security = AddEquity("SPY", Resolution.Daily);
        _spy = security.Symbol;
        security.SetFillModel(new AtlasLimitedFillModel());
    }

    public override void OnData(Slice data)
    {
        if (!data.Bars.ContainsKey(_spy)) return;
        _sessions++;
        if (_sessions == 1)
            _ticket = MarketOrder(_spy, 12, asynchronous: true);
        else if (_sessions == 2 && _ticket != null)
            _ticket.Cancel("ATLAS cancel unfilled remainder");
    }

    private sealed class AtlasLimitedFillModel : FillModel
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
