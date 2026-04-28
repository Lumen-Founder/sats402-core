# SATS-402 Protocol v0.3

## 1. Request envelope

The client SDK sends the request envelope before the first 402 negotiation.

```http
SATS402-REQUEST: base64url(json({
  v: "0.3",
  mode: ["atomic_response", "atomic_bridge"],
  buyer_eph_pk: "...",
  buyer_nonce: "...",
  payment_id: "pay_...",
  request_hash: "...",
  max_price_usd: "0.01",
  wallet_caps: {
    lightning: true,
    preimage_return: true,
    hold_invoice: true
  }
}))
```

Production should use CBOR. This demo uses base64url(JSON) for readability.

## 2. Merchant 402 challenge

The merchant returns:

- encrypted response bytes
- payment hash `H = SHA256(S)`
- merchant ephemeral public key
- payment requirements
- CLTV policy
- ciphertext commitment

## 3. Key derivation

The Lightning preimage is not used as the direct encryption key.

```txt
shared_secret = ECDH(agent_eph_sk, merchant_eph_pk)
key = HKDF(
  input = S || shared_secret,
  salt = request_hash || payment_id || payment_hash,
  info = "sats402-response-v0.3"
)
```

This prevents the facilitator or intermediate Lightning nodes from decrypting the response even if they observe the preimage.

## 4. Same-hash HTLC bridge

```txt
Agent -> Gateway HTLC locked to H
Gateway -> Merchant HTLC locked to same H
Merchant reveals S
Gateway uses S to settle Agent-side HTLC
Agent receives S and decrypts response
```

## 5. CLTV invariant

```txt
E_agent_to_gateway >= E_gateway_to_merchant_first_hop + Δbridge_safety
```

If this invariant fails, the gateway refuses the bridge before any HTLC exposure.

## 6. Receipts

The receipt separates:

- payment state
- response state
- authorization state
- facilitator role
- custody and credit exposure

This is critical. SATS-402 does not claim semantic quality of the payload. It proves cryptographic delivery of encrypted response bytes after Lightning payment settlement.
