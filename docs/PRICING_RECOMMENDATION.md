# Pricing recommendation — Infovantage ITSM

Prepared 13 Oct 2026. **Your decision.** The code takes the price only when you create the PayPal plan (`--price`), so it is easy to change.

## What I verified, and what I could not
**Verified today** (Atlassian's public pricing page for Jira Service Management, monthly view as displayed to me):

| Plan | Price shown |
|---|---|
| Free | US$0, up to **3 agents** |
| Standard | **US$20** per agent per month |
| Premium | **US$51.42** per agent per month |

**Not verified:** Freshservice, Zendesk, Zoho Desk, HappyFox and others. My browser needed a permission to read those sites that was not granted. I will not quote their prices from memory. If you allow the browser prompt, I can check them. Prices also vary by billing period, region and promotion, so re-check before you publish anything.

## What this means for your plans (at R18 per US$1, the rate used in the financial model)
| Your plan | Price | About | Against Jira Service Management |
|---|---|---|---|
| Starter (incidents and tickets only) | R199 | US$11 | About 45% below Standard, which also includes more. Fair for a narrower product |
| Professional (SLA, escalation, alerts, reports) | R349 | US$19 | In line with Standard (US$20) |
| MSP / Business Plus | R549 | US$30 | Well below Premium (US$51.42), but multi-client features are not built yet |

## Recommendation
1. **South Africa, invoiced in rand:** keep Starter at **R199**, Professional **R349**, MSP **R549**.
2. **International, PayPal in US dollars:** set Starter at **US$12 per agent per month** (`--price 12.00`). That is roughly your rand price, rounded up to cover PayPal's fees, and still well under Jira Standard. Add `--trial-months 1` if you want a free first month; PayPal then runs the trial and starts charging by itself.
3. **Do not compete with "free".** Jira gives teams of up to 3 agents the product free. A 1-3 agent customer is a hard sale on price alone. Aim at **teams of about 4 to 25 agents**, small MSPs and South African businesses that want rand pricing and local support. A one-month trial is a better answer to "free" than a permanent free tier.
4. **VAT.** South African customers pay 15% on top (US$12 becomes US$13.80). International customers are billed US$12 with no VAT added. Have your accountant confirm whether your sales to non-South-African customers can be zero-rated, and whether you are VAT-registered.
5. **Review** after your first 10 paying organisations or 90 days from the first paying customer, whichever is first (the rule already in your plan).

## What I have not modelled
PayPal's fees (they are a percentage plus a fixed amount per payment and differ for international payments; I have not verified them), annual-billing discounts, and per-country pricing. The financial model's payment-fee input is a labelled placeholder.
