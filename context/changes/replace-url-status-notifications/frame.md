# Frame Brief: Action-result notifications

> Framing step before implementation. This document captures what is actually at issue, separated from what was
> initially assumed.

## Reported Observation

Notifications after actions are represented in URLs such as `/dashboard?status=ai-workout-saved` and displayed as
persistent inline banners.

After the toast conversion, the resulting presentation remains visually too heavy: semantic `richColors` fills the
whole surface with saturated green or red, the title and description duplicate hierarchy, and the circular close button
sits outside the card.

## Initial Framing (preserved)

- **User's stated cause or approach**: Action-result notifications are assigned to URL status values.
- **User's proposed direction**: Replace all statuses with reusable top-right toast messages that auto-dismiss after five
  seconds and have a user-operated close button; shadcn may provide the base component after download.
- **Pre-dispatch narrowing**: Every action-result status is in scope, including success, warning, and error statuses.
- **Visual refinement**: Use Sonner's compact single-message structure with an integrated close control. Keep the
  surface neutral and express the app identity through restrained purple/lilac accents.

## Dimension Map

1. **Transport** — query parameters persist action results in browser history and copied URLs.
2. **Presentation** — dashboard and account pages render statuses as inline banners. ← initial framing
3. **Lifecycle** — inline messages have no automatic dismissal or close control.
4. **Validation** — dashboard messages must still be checked against durable workout state before they are shown.

## Hypothesis Investigation

| Hypothesis                    | Evidence                                                                        | Verdict |
| ----------------------------- | ------------------------------------------------------------------------------- | ------- |
| URL transport causes replay   | Action endpoints redirect to `?status=...`; pages read the same query parameter | STRONG  |
| Presentation is page-specific | Dashboard and Account duplicate inline status markup and message maps           | STRONG  |
| Lifecycle is persistent       | Existing status banners have neither timer nor close action                     | STRONG  |
| State guards are independent  | Dashboard only shows several success statuses when the loaded plan agrees       | STRONG  |

## Narrowing Signals

- The requested scope is all action-result status values, not only the AI workout example.
- Ordinary query parameters used for filters and catalogue navigation are unrelated and remain URL-backed.
- The compact Sonner example is the visual target: keep messages on one line when space permits, but center the toast
  and wrap the complete message on screens up to 600px rather than truncating it.
- Status semantics should remain available through icon shape and toast type without saturating the entire background.

## Cross-System Convention

Use an allow-listed, short-lived flash value for redirect transport, consume it once during SSR, and pass the resolved
message into one shared toast host. Preserve server-side state validation before displaying workout success messages.
For presentation, use a neutral slate surface, subtle lilac border and icon, one message block, and a close control inside
the card; avoid Sonner's full-surface `richColors` mode.

The workout-completion grace period uses the same Sonner host and styling, with an Undo action and a five-second progress
indicator that remains visible during hover. Its existing state-machine deadline remains authoritative: Undo restores
the card, while closing the toast only dismisses the presentation and does not cancel completion.

Sonner's base stylesheet is linked from the root layout before the app stylesheet. This keeps positioning and structural
styles present across Astro client-router page swaps, while ensuring the app's theme and responsive overrides win the
cascade consistently.
