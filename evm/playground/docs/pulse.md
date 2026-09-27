# Pulse: the proposition

Authority: project intent and the continuous mathematical proposition. For exact contract behavior, use the indexed Core V1 specification and release artifacts.

Pulse asks whether a transparent price–time rule can respond to supply and demand without an auctioneer continually adjusting the price. Its central idea is **waiting drops, buying pumps**.

- A Dutch auction supplies the drop. In the continuous model, `p(t) = B + k / (t − A)` for `t > A`, where B is the floor and A is the time anchor.
- The Price–Time Scale (PTS) supplies the target increase after a purchase: `R = PTS × waiting time`. A longer wait targets a larger increase above the price paid. It does not necessarily produce a higher absolute next ask, because the purchase price has been falling.

Each purchase starts a new descending curve. As the cycle repeats, participants shape the price through when they buy and how long they wait.

With these rules public and fixed before launch, Pulse becomes a **Decentralized Automatic Auction (DAA)**. Neither an operator nor an adaptive mechanism rewrites the rules to steer the outcome. Demand may grow, settle, or fade; success and failure are both outcomes to learn from.

This is a proposition for price discovery, not a proof that the price converges to equilibrium or that a project will succeed.

## Theory and implementation

Core V1 chooses `next floor = previous sale price`. This floor ratchet is a practical policy intended to keep the implementation simple and constrain further issuance through price. It is distinct from the central drop/pump proposition. It guarantees neither a fixed supply cap nor an eventual end to sales.

Each project must enforce the commitment to public, fixed rules in its own auction contract. Using Pulse Core alone does not make an application immutable.

In the continuous curve, the price remains above the floor at finite time. Core V1 uses integer seconds and payment units; after sufficient waiting its increment can round down to zero, leaving the next floor unchanged. Exact rounding, limits, and errors belong to the Core specification.

## Where Pulse Core V1 fits

These uses suit Core V1’s floor ratchet: each sale sets the next floor, and that baseline cannot fall. Other implementations of the Pulse proposition may choose a different floor policy.

In experimental art, buying, waiting, and the price history can become part of a work released in editions. Core V1 can also be studied through simulations or separate auctions with different fixed settings: how do PTS and the floor ratchet affect further participation?

These projects are ready to welcome success, accept failure, and learn from either. Application contracts own the auction; Core V1 supplies only the calculations.
