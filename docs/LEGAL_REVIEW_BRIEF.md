# Brief for a lawyer — Infovantage ITSM terms, privacy notice and billing

I am not a lawyer, and nothing here is legal advice. This brief exists so that a South African lawyer (ideally one who also knows international software sales) can review quickly. The privacy notice (`/privacy`) and terms (`/terms`) say on their face that they have not been legally reviewed.

## What the service does
Hosted incident and ticket management for small businesses. Each customer's data is held in its own database on Cloudflare. A public site collects demo and waitlist requests (name, work email, organisation, optional message, recorded consent). Optional monthly PayPal subscription billing, in US dollars, per billable agent, 15% VAT added for South African customers and none added for international ones. Where "enforcement" is switched on, a lapsed workspace becomes read-only (data is never deleted; export remains possible).

## Please review, in this order
1. **Privacy notice against POPIA.** Who is the responsible party and Information Officer (and is registration with the Information Regulator needed)? Is consent-based processing for the demo form correct? Cross-border transfer to Cloudflare, PayPal and the email provider. Retention wording. Rights requests process.
2. **Terms of service.** Limitation of liability and "as is" wording; governing law (South Africa); suspension rights; the statement that no uptime or SLA is offered; data held 30 days after a subscription ends and then deletable; price-change notice (30 days).
3. **Cancellation and refund terms** (Terms, "Cancellation and refunds"). Proposed: cancel any time; no refund of the month already paid; refund of the first payment if asked within 7 days; refund of erroneous or double charges. Check against the **Consumer Protection Act** (fixed-term agreements, cancellation, direct marketing cooling-off) and the **Electronic Communications and Transactions Act** (information a supplier must show on a website; distance-selling cooling-off).
4. **Required supplier details.** The site shows no registered company name, address or contact details yet. ECTA and the CPA may require them. I have not invented any; the owner must supply them.
5. **VAT and invoicing** (accountant, not only lawyer). 15% on South African customers; whether services to non-resident customers can be zero-rated and what evidence of residence is needed; tax invoices; the customer's self-declared region (Billing asks "Where is your business based?" and relies on the answer).
6. **International customers.** Whether UK or EU customers trigger GDPR obligations (a data-processing agreement, standard contractual clauses) and whether other regimes matter.
7. **PayPal.** Merchant agreement and acceptable-use fit for a subscription software business; chargeback and dispute handling; whether a South African seller can receive US-dollar subscription payments as designed.
8. **Free trial wording** (Terms, "Free trials") and the automatic first charge when a trial ends (consumer protection rules on auto-renewal).
9. **Read-only enforcement.** Whether suspending write access after a 7-day grace period for non-payment, while preserving read and export, is acceptable as drafted, and what notice must precede it.

## Facts the lawyer may ask for
Each customer is a separate workspace and database. Passwords are stored as salted hashes. Card and PayPal login details are never seen or stored (PayPal handles them). The app stores the PayPal subscription id and, for each payment, its amount, date and PayPal reference. IP addresses are used only in short-lived rate-limit counters (cleared within about a day). There is no analytics or advertising tracking on the site.
