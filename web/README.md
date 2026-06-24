# Caliper Arc Pro — Demo Site

> A fictional headphones e-commerce site built to demonstrate the Caliper A/B testing SDK in a realistic product context.

**[Live Site](\<TODO: web URL\>)** · [Caliper Dashboard](https://caliper-xi.vercel.app) · [Root README](../README.md)

---

## Purpose

This site exists as a realistic instrumentation target for Caliper. Rather than demonstrate the SDK against a contrived toy page, it's a full e-commerce landing experience — hero section with background video, product configurator, testimonials, spec table, and buy section — with three live A/B experiments running concurrently.

It serves two roles: as a demo for evaluators clicking through the live URL, and as the data source for the experiment results visible in the [Caliper Dashboard](https://caliper-xi.vercel.app).

---

## Running Experiments

Three experiments are active on the site:

| Experiment ID | What it tests | Conversion metric |
|---|---|---|
| `hero_cta_test` | Whether adding a gold CTA button to the hero section increases scroll-to-buy | `buy_section_view` |
| `buy_button_test` | Add-to-cart button styling on the product page | `add_to_cart` |
| `nav_layout_test` | Navigation layout variant — deliberately 60/40 split to trigger SRM | `nav_cta_click` |

Variant assignment is deterministic per user (cyrb53 hash of `userId:experimentId`) so the same user always sees the same variant. On first visit, a UUID is generated and persisted in `localStorage`.

---

## The Caliper SDK

The SDK lives in `lib/caliper/sdk.ts` and is used directly by page components via the `useCaliperVariant` hook.

**`CaliperClient`** — the main class. On initialization, it sets up an `EventBuffer` and registers a `beforeunload` flush. It exposes three methods:

- `assign(experimentId)` — fetches variant from `/api/assign` with a 2-second timeout, falls back to the cyrb53 hash if the API is unreachable. Fires `experiment_exposed` automatically via the React hook.
- `track(eventName, properties?)` — fans the event out to all currently enrolled experiments and adds it to the buffer.
- `flushNow()` — force-flush the buffer (used on page unload).

**`EventBuffer`** — batches events and POSTs to `/api/ingest`. Flushes automatically when the batch reaches 10 events or after 500 ms of inactivity, whichever comes first.

**`useCaliperVariant(experimentId)`** — React hook that calls `assign()` on mount and fires `experiment_exposed` once the variant resolves. Returns `{ variant, isLoading }`.

**`CaliperDevPanel`** — a floating overlay (visible in development) that shows the active variant for each experiment and a live log of tracked events. Useful for verifying SDK wiring during development.

---

## Running Locally

```bash
npm install
npm run dev
# http://localhost:3000
```

---

## Environment Variables

```bash
NEXT_PUBLIC_CALIPER_API_URL=https://caliper-xi.vercel.app   # or http://localhost:3001 locally
NEXT_PUBLIC_CALIPER_API_KEY=caliper_demo_key_public
```

Without these variables, the SDK still works: variant assignment falls back to the local cyrb53 hash, but events are not recorded and the dashboard will not update.

---

## Architecture

See [root README](../README.md) for the full system architecture. This site sits at the leftmost edge — it generates the raw events that flow into DynamoDB, trigger the aggregator Lambda, and ultimately appear as experiment results in the dashboard.
