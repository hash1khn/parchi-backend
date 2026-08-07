Parchi — Offers, Branches & Redemption Review
Prepared: August 7, 2026

Overview

You asked us to check whether the offers/branches/bonus/redemption system works the way it's supposed to, and to make the admin dashboard easier to manage. Below is what we found, what we fixed, and what's still open.

The core question — can a merchant run more than one offer at the same time across its branches — was correct in principle but was actually blocked in the code. That's now fixed. A few other issues turned up along the way that were affecting live redemptions, and those are fixed as well.

What we fixed

1. Multiple offers per merchant now actually works.
Previously, assigning an offer to a branch would silently remove any offer that branch already had. So even though the underlying design allowed a merchant to run several offers at once, the moment someone assigned or reassigned an offer through the dashboard, it quietly reset the branch back to one offer. This is fixed — branches can now hold several active offers at the same time, and students choose which one to use when they scan.

2. Offers with day/time restrictions were being shown to students before they were actually available, causing failed redemptions.
An offer set to "weekdays only" or "12pm–3pm only" was still being offered to students outside those hours. The check only ran at the very last step, when the redemption was being recorded — by which point branch staff may have already approved the request. Students would occasionally hit an error after staff thought the redemption had gone through. This check now runs everywhere an offer is shown to a student, not just at the final step.

3. A timezone bug in that same time-of-day check.
The system was comparing offer hours against the server's clock rather than Pakistan time specifically. Depending on server configuration, a "12–3pm" offer could show as available at the wrong hours. This is now locked to Pakistan time everywhere.

4. A QR scan edge case where the wrong offer could get approved.
If a student scanned, picked an offer, then changed their mind and picked a different one within the same couple of minutes, the system could still process the original selection instead of the new one. This has been corrected.

5. Admin dashboard — Offers section rebuilt.
Opening a merchant now shows, in one place: the offers currently running, the bonus/loyalty program in plain language (explaining exactly how "whole merchant" bonuses differ from "single offer" bonuses), and a branch-by-branch view showing which offers each branch accepts, with a one-click switch for instant redemption vs. staff approval. Assigning offers to a branch is now a checklist instead of a single dropdown, so multiple offers per branch is reflected in the interface too, not just the backend.

What's still open — needs a decision from you

1. The merchant self-service dashboard has a "Bonus Settings" screen that doesn't actually do anything.
Merchants (and their branch managers) can go into their own dashboard and configure a bonus — how many redemptions before a discount kicks in, etc. That screen saves to a part of the database the redemption engine has never read. The real bonus system lives elsewhere and works correctly, but it's only exposed through the admin dashboard, not the merchant's own dashboard. Any merchant who has used that self-service screen believes they've set up a bonus, and nothing has happened.
We did not touch this — fixing it means either connecting that screen to the real bonus system or removing it, and we didn't want to make that call without you. Recommend deciding soon, since it's actively misleading merchants right now.

2. Students can't see which offer is available at which branch before they walk in and scan.
On the merchant's page in the app, offers and branch locations are shown as two separate, unconnected lists. A student sees "this merchant has 3 deals" and "these are the locations" but has no way to know that, say, only two of five branches accept a particular deal. They only find out once they've arrived and scanned the QR code at that specific branch. If you'd like students to see this ahead of time, that's a new screen to design, not a side effect of anything we fixed today.

Everything above has been checked against the actual code, and the backend and dashboard both build cleanly with these changes in place.
