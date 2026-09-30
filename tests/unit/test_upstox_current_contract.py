from atlas.broker.upstox_sandbox import PLACE_ORDER_PATH, SANDBOX_BASE_URL


def test_current_upstox_sandbox_place_order_contract_uses_v3() -> None:
    assert SANDBOX_BASE_URL == "https://sandbox.upstox.com"
    assert PLACE_ORDER_PATH == "/v3/order/place"
