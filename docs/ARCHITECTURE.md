# Architecture

The React UI calls `/api/board`. The route uses identity supplied by the Sites authentication gateway and a per-instance D1 binding named `DB`. Session and roster writes share capacity, name-claim, organizer and waitlist rules.

| Component | Purpose |
| --- | --- |
| `app/page.tsx` | Board, signup, calendar and WhatsApp UI |
| `app/api/board/route.ts` | Authenticated actions and public board read |
| `app/chatgpt-auth.ts` | Sites trusted identity gateway adapter |
| `lib/organizer.ts` | Session owner and configured board owner authorization |
| `lib/waitlist.ts` | Atomic promotion into vacancies |
| `lib/name-claims.ts` | One permanent name reservation per account |
| `lib/share-changes.ts` | Concise changes, today reminders and open sessions |
| `drizzle/` | Schema-only migrations and Drizzle metadata |
| `rally.config.json` | Instance owner email hash; blank in published source |

The reusable source has no production Site ID and no runtime data. Setup never selects a production resource. The local migration script supplies `--local` explicitly and never accepts remote flags. No deploy-on-push workflow is included.

Independent groups must create independent Site IDs and databases. Updating the GitHub repository does not update any Site. A deployment requires that instance's authenticated Sites publishing workflow.

The owner hash is only an equality configuration, not authentication. Authentication must come from the trusted gateway; choosing an owner's email in a form or forging a display name never grants admin access.
