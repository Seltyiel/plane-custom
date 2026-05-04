# Changelog

Tutte le modifiche notabili a `plane-custom`. Formato basato su [Keep a Changelog](https://keepachangelog.com/), versioning incrementale interno (non semver upstream Plane).

La fonte di verita' alternativa e' il commento storico in `patches/00-core/edition-badge.tsx`, qui in formato strutturato.

---

## [v1.35a-4] - 2026-05-04 (Meetings: cancel singola occorrenza vs serie)

### Aggiunto
- **Backend** nuovo endpoint `POST /api/workspaces/<slug>/meetings/<id>/skip-occurrence/` con body `{ "occurrence_date": "YYYY-MM-DD" }`. Aggiunge la data a `excluded_dates` del master meeting. Solo il creator puo' invocarlo. Idempotente. La GET list endpoint poi salta quella occorrenza durante l'espansione (logica gia' presente in `_expand_meeting_occurrences` v1.35a-1, ora effettivamente sfruttata).
- **Frontend** `meeting-service.ts`: nuovo metodo `skipOccurrence(slug, meetingId, occurrenceDate)`.
- **Detail modal** `meeting-detail-modal.tsx`: `handleCancel` ora distingue 2 casi:
  - Modal aperto cliccando un'occorrenza di un meeting ricorrente (`occurrenceDate` set + `recurrence_rule` non-null): apre un prompt dove l'utente sceglie tra `"this"` (skip solo questa occorrenza), `"series"` (cancel master), oppure aborta.
  - Altri casi: comportamento originale (cancel del master).
- URL route registrata in `api-urls-workspace.py`.

### Scope rinviato
- **Edit single occurrence** (creare un Meeting child con `parent_meeting=master` per override una occorrenza specifica) e' rinviato a v1.35a-4b. Il design e' chiaro (campo `parent_meeting` gia' presente nel model) ma la UI richiede un secondo modal e cura nei race condition tra master/child. Per ora "Edit" su un'occorrenza edita il master (whole series).

### Note implementative
- Il prompt scelta usa `window.prompt` come MVP (UX minimale ma funzionale). Sostituibile con un modal scelta dedicato in v1.35a-4c se l'UX da prompt risulta scomoda.
- Lo skip e' idempotente: chiamare 2 volte con la stessa `occurrence_date` non duplica il record in `excluded_dates`.

---

## [v1.35a-3] - 2026-05-04 (Meetings: indicatori visivi recurrence + occurrence_date nel detail)

### Aggiunto
- **Calendar overlay** (`calendar-meeting-blocks.tsx`): nelle tile dei meeting, accanto all'icona Calendar, compare un'icona `RefreshCw` quando il meeting e' ricorrente (`recurrence_rule != null` o `is_occurrence === true`). Click su un'occorrenza passa l'`occurrence_date` al detail modal.
- **Detail modal** (`meeting-detail-modal.tsx`): nel header sotto il titolo, badge `accent-primary/10` con `RefreshCw` + summary human-readable della rule (es. "Weekly on Monday, 13 occurrences", "Every weekday", "Monthly on day 15"). Tooltip espone la stringa RRULE raw per debug.
- **Detail modal banner**: se aperto cliccando un'occorrenza virtuale, badge `surface-2` "Occurrence of YYYY-MM-DD" indica all'utente la data specifica dell'occorrenza visualizzata (vs il master).
- **Meetings list page** (`meetings-root.tsx`): icona `RefreshCw` accanto al titolo nei row delle tabelle Upcoming / Past per i meeting ricorrenti.

### De-duplicazione list
- Il backend GET `/meetings/` ritorna anche le N occorrenze virtuali di un meeting ricorrente. Il **Calendar view** le vuole tutte (rendering giorno per giorno). La **list workspace** invece vuole solo il master (1 riga per meeting). Nuovo filtro client-side in `meetings-root.tsx`: `meetings.filter(m => !m.is_occurrence)` prima del sort. Il backend non viene cambiato (il duplo behavior dipende dal consumer).

### Helper aggiunti
- `summarizeRecurrence(rrule, startISO)` in `meeting-detail-modal.tsx`: parser stand-alone della RRULE che ritorna stringa human-readable. Speculare a `previewText` in `meeting-create-modal.tsx`.

### Note
- L'icona usa `lucide-react.RefreshCw`, scelta per coerenza visuale con il convenzionale "loop/recurring" pattern di Google Calendar e Microsoft Outlook.

---

## [v1.35a-2b] - 2026-05-04 (Meetings: hotfix completo cascade-close + focus-trap)

### Bug
- Step 1 (osservato in v1.35a-2): aprire detail modal, click "Edit" → click su un qualsiasi input dell'edit chiudeva entrambi i modal a cascata (HeadlessUI outside-click).
- Step 2 (osservato dopo v1.35a-2a): risolto il cascade-close gating `handleClose` del detail con `!editOpen`, ma comparso un secondo problema: il focus-trap del Dialog del detail rubava il focus dagli input dell'edit. Click sul campo Title metteva focus, ma typing non registrava nulla. Solo il select Repeat funzionava (interazione native browser che non richiede focus sostenuto).

### Fix v1.35a-2b
- Soluzione corretta: nel detail modal, settare `isOpen={isOpen && !editOpen}`. Mentre l'edit e' aperto il detail e' completamente nascosto (Dialog smontato dopo transizione → no focus-trap conflict, no outside-click cascade). Quando l'edit si chiude (`setEditOpen(false)`), il detail si rimonta automaticamente con i dati aggiornati via SWR mutate.

---

## [v1.35a-2a] - 2026-05-04 (RITIRATA - sostituita da v1.35a-2b)
- Tentativo iniziale di fix con gating `handleClose={!editOpen && ...}`. Risolveva il cascade-close ma lasciava attivo il focus-trap conflict. Sostituita da v1.35a-2b che chiude il detail completamente quando l'edit e' aperto.

---

## [v1.35a-2] - 2026-05-04 (Meetings: UI campo Repeat nel Create/Edit modal)

### Aggiunto
- Nuovo campo "Repeat" nel `MeetingCreateModal` con preset: Does not repeat / Daily / Weekly (lo stesso giorno settimana del start_at) / Every weekday (Mon–Fri) / Monthly same date / Monthly same weekday (es. "primo lunedì del mese") / Yearly.
- Selettore fine ricorrenza: Never / On date / After N occurrences (con relativa input data o counter).
- Anteprima testuale della rule selezionata (es. "Weekly on Tuesday, until 2026-12-31") per dare feedback immediato.
- In edit mode il modal parsa la `recurrence_rule` esistente per ripopolare il preset selezionato. Se la rule non matcha nessun preset (custom RRULE) il selettore mostra "Custom rule (read-only)" con warning, e al submit la rule originale viene preservata.
- `IMeetingCreatePayload` esteso con campi `recurrence_rule`, `recurrence_until`, `excluded_dates`. `IMeeting` esteso con flag `is_occurrence` e `occurrence_date` (popolati dal backend per le occorrenze virtuali, v1.35a-1).

### Note
- Il modal genera la stringa RRULE lato client ma la passa al backend che la valida (v1.35a-1 serializer.validate).
- Per "Monthly same weekday" calcoliamo l'ordinale del giorno nel mese: 1°/2°/3°/4° → numero diretto, 5°+ → -1 (ultimo del mese).
- Niente icona "ricorrente" ancora sulla tile del Calendar overlay né nel list — rinviato a v1.35a-3 insieme al click handler che apre il modal con info "occorrenza del DD/MM/YYYY".

---

## [v1.35a-1] - 2026-05-04 (Meetings: backend RRULE expansion per recurrence)

### Aggiunto
- Nuovo helper backend `_expand_meeting_occurrences(meeting, date_from, date_to)` in `meeting-view.py` che usa `python-dateutil.rrule.rrulestr` per espandere un Meeting con `recurrence_rule` settato in N occorrenze virtuali entro la finestra richiesta.
- `MeetingListCreateEndpoint.get` ora separa meeting ricorrenti da non-ricorrenti: i non-ricorrenti applicano il filtro classico `start_at`/`end_at`; i ricorrenti bypassano il filtro data sul master e vengono espansi via helper. Ogni occorrenza ritornata ha:
  - tutti i campi del master (titolo, attendees, issue_links, ecc.)
  - `start_at`/`end_at` calcolati per quell'occorrenza
  - `occurrence_date: "YYYY-MM-DD"` (chiave per identificare l'occorrenza)
  - `is_occurrence: true` flag.
- Le occorrenze in `excluded_dates` (cancellate singolarmente, v1.35a-4) vengono saltate durante l'espansione.
- POST e PATCH endpoint ora accettano `recurrence_rule`, `recurrence_until`, `excluded_dates` come campi editabili.
- Validazione `recurrence_rule` nel `MeetingSerializer.validate`: solo `FREQ` ∈ {DAILY, WEEKLY, MONTHLY, YEARLY} (no MINUTELY/SECONDLY); test parsing via `dateutil.rrule.rrulestr`; errore HTTP 400 con messaggio user-friendly se non parsabile.

### Cap di sicurezza
- Max 365 occorrenze ritornate per singolo meeting in una request (anti-DoS contro RRULE abusive).
- Cap di 5 anni dal master.start_at se RRULE non specifica `UNTIL`/`COUNT` e nessun `recurrence_until`.

### Note implementative
- Audit mode (`light_extra_qs` per workspace admin con `meetings_admin_audit_mode=true`) NON espande le occorrenze ricorrenti — admin vede solo il master. Espansione audit rinviata a v1.35a-1b se richiesto.
- L'expansion avviene nella response del list endpoint, non nel detail. Il detail di un meeting ricorrente ritorna sempre il master (single record), perché l'edit/cancel di un'occorrenza singola va via endpoint dedicato (v1.35a-4).

---

## [v1.34h-4] - 2026-05-04 (Meetings: activity feed entry per link/unlink/cancel)

### Aggiunto
- Quando un meeting viene linkato a un task (POST `/issue-links/`), un'entry compare nel feed Activity dell'issue: "L. scheduled meeting *titolo*". Click sul nome del meeting → apre `MeetingDetailModal`.
- Quando un meeting viene scollegato da un task (DELETE `/issue-links/`), entry analoga con verbo "unlinked meeting *titolo*".
- Quando un meeting con linked issues viene cancellato (DELETE `/meetings/<id>/`), un'entry "cancelled meeting *titolo*" viene creata su OGNI issue linkato.

### Architettura backend
- **Approccio chosen**: in `meeting-view.py` creo sincrono `IssueActivity.objects.create(...)` records con `field="meeting"`, `verb="created"|"deleted"|"cancelled"`, `new_value=meeting.title`, `new_identifier=meeting.id`, `comment="scheduled a meeting"|"unlinked a meeting"|"cancelled a linked meeting"`.
- **NO Celery dispatcher**: il file stock `issue_activities_task.py` (1600+ righe) gestisce le activity tramite Celery + dispatcher di tipi. Avrei dovuto fare full-replacement per registrare un nuovo type "meeting.activity.created", ma il file e' troppo grande e fragile a regressioni upstream. Il sincrono `objects.create()` raggiunge lo stesso risultato (entry creata) con surface molto piu' piccola. Trade-off: niente notification email ai watcher dell'issue. Se servira', migrazione al pattern Celery in v1.34h-4b.
- Helper `_log_meeting_activity(issue, meeting, verb, comment, actor)` con try/except (non critical-path → swallow su errore).

### Architettura frontend
- Nuovo componente `IssueMeetingActivity` (`patches/13-meetings/issue-meeting-activity.tsx`):
  - Replica esatta del pattern `IssueLinkActivity` stock (`IssueActivityBlockComponent` + testo verb-aware).
  - Icona `Calendar` (Lucide).
  - Click sul nome del meeting → apre `MeetingDetailModal` (riusa v1.34d).
- Full-replacement di `activity-list.tsx` (`patches/13-meetings/issue-activity-list.tsx`):
  - +1 import + 1 `case "meeting"` nello switch del field.
  - Posizionato prima del `default` fallback per intercettare prima di `AdditionalActivityRoot`.

### File toccati
- Modificato: `patches/13-meetings/meeting-view.py` (import `IssueActivity`, helper `_log_meeting_activity`, 3 hook nei punti di mutation)
- Nuovo: `patches/13-meetings/issue-meeting-activity.tsx`
- Nuovo: `patches/13-meetings/issue-activity-list.tsx` (full-replacement stock)
- `build.bat`: 2 nuove copy step v1.34h-4
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34h-4

---

## [v1.34h-2a] - 2026-05-04 (Meetings: toggle Show/Hide ora effettivamente nasconde i meeting)

### Fixato
- Il toggle si toglieva visivamente ma il calendar continuava a mostrare i meeting.
- Causa: passavo `filters=undefined` a `useMeetings` quando off, ma il `useMeetings` fetcher fa GET senza from/to comunque (ritorna tutti i meeting visibili). Quindi i meeting venivano comunque caricati e renderizzati.
- Fix: ora passo `workspaceSlug=""` quando off → SWR key e' null → niente fetch → `meetings=[]` → niente render.

### File toccati
- `patches/13-meetings/meetings-calendar-context.tsx`
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34h-2a

---

## [v1.34h-2] - 2026-05-04 (Meetings: toggle Show/Hide nel Display dropdown - via workspace_feature_settings)

### Aggiunto
- **Toggle "Show meetings in calendar"** nel Display dropdown stock, accanto a "Show sub-work items". Pattern visuale identico (`FilterOption` stock con `CheckIcon` + `<button>`). Visibile solo quando `displayFilters.layout === "calendar"`.
- Storage: riusa `workspace_feature_settings` (v1.33e generic), key `meetings_show_in_calendar` (default `true`). Per-workspace, non per-user.
- Read: `useFeatureSettings(slug).getFlag<boolean>("meetings_show_in_calendar", true)` — sincrono dal cache SWR (gia' fetchato dalla pagina Settings v1.33f e v1.34g, niente extra fetch).
- Write: `setFlags({ meetings_show_in_calendar: !current })` con cache mutate sincrono.
- Backend gating: PATCH richiede admin. Member/Guest vedono il toggle visibile (riflette il flag corrente) ma in stato `disabled` con tooltip "Only workspace admins can change this setting".
- `MeetingsCalendarProvider` legge il flag e short-circuita il fetch dei meeting se off (no fetch -> array vuoto -> niente render nei chip).

### Decisione architetturale (rispetto al primo tentativo fallito)
La prima versione di v1.34h-2 introdusse un nuovo backend (`UserMeetingPreference` + migration 0129) + nuovo hook custom + ottimistic update SWR + `dlog` in render. Il `dlog` in render ha causato side effect durante hydration React → errori #418/#423 → UI corrotta. Stash reference: `git stash@{0}`.

Il nuovo approccio v1.34h-2 e' minimale:
- Niente backend nuovo (riuso `workspace_feature_settings` v1.33e).
- Niente hook custom (riuso `useFeatureSettings` v1.33e).
- Niente migration nuova.
- Niente `dlog` in render.
- Niente optimistic update (basta `mutate` sincrono di SWR).
- Niente toast invasivi (errori swallow silente).
- Toggle gating: admin-only via `useUserPermissions` (UI consistente con il backend gating).

Trade-off accettato: per-workspace invece di per-user. Se un giorno servira' per-user, si fara' come iter separato con backend dedicato.

### File toccati
- Nuovo: `patches/13-meetings/meetings-show-toggle.tsx`
- Nuovo: `patches/13-meetings/display-filters-selection.tsx` (full-replacement stock)
- Modificato: `patches/13-meetings/meetings-calendar-context.tsx` (import `useFeatureSettings`, short-circuit fetch se off)
- `build.bat`: 2 nuove copy step v1.34h-2
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34h-2

---

## [v1.34h-1] - 2026-05-04 (Meetings: multi-day events nel Calendar overlay)

### Cambiato
- `MeetingsCalendarProvider` (`meetings-calendar-context.tsx`): il `byDate` Map ora indexa ogni meeting su TUTTI i giorni che copre (cursor da `start_at` a `end_at` midnight locale, incluso). Prima: solo il giorno di `start_at`.
- Esempio: un meeting `04/05 12:00 → 06/05 14:00` ora appare nei chip dei giorni 04, 05 e 06. Prima appariva solo il 04.
- Cap di safety a 30 giorni per meeting con `end_at` malformato (evita loop infiniti).
- Edge case: `end_at` invalid → fallback a 1 solo giorno (start).

### Note design
Il chip nel calendar mostra l'ora di start in TUTTI i giorni (anche middle/end). Ridondante ma semplice. Marker "continues" / "all-day band" possono essere aggiunti in futuro per distinguere primo/middle/ultimo giorno.

### File toccati
- Modificato: `patches/13-meetings/meetings-calendar-context.tsx` (single-file change isolato)
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34h-1

### Nota su precedente tentativo fallito
Il primo tentativo v1.34h (1+2+3 in bundle) aveva introdotto errori React #418/#423 che hanno corrotto la UI. Le modifiche v1.34h-2 (toggle Show meetings + backend UserMeetingPreference) e v1.34h-3 (per-user reminder default) sono state stashed (`git stash@{0}`) e verranno reintrodotte una alla volta in iterazioni isolate dopo aver verificato la stabilita' di v1.34h-1.

---

## [v1.34g] - 2026-05-02 (Meetings MVP slice 7: workspace settings page)

### Aggiunto
- **Pagina settings `/<slug>/settings/meetings/`** workspace-level con toggle "Audit mode for workspace admins":
  - Quando ON, i workspace admin vedono i meeting di altri (a cui non sono attendee) tramite `MeetingLightSerializer` (solo title + start/end + attendee count, NO description/attendee names/location). Per compliance/audit.
  - Quando OFF (default), ogni utente vede solo i meeting di cui e' creator o attendee.
  - Solo workspace admin puo' modificare; member/guest vedono read-only banner.
- **`MeetingsSettingsForm`**: riusa `useFeatureSettings(workspaceSlug)` (v1.33e generic), legge/scrive il flag `meetings_admin_audit_mode` via `WorkspaceFeatureSettingsEndpoint`. Stesso pattern Row di `time-tracking-settings-form` (v1.33f) per coerenza visiva.
- **Sidebar settings entry "Meetings"** in sezione FEATURES (sotto "Time tracking"). Icon `Calendar`. Esteso `constants-settings-workspace.ts` + `sidebar-item-icon.tsx` + `types-settings.ts`.
- **Route `/<slug>/settings/meetings/`** registrata in `routes-core.ts`.

### File toccati
- Nuovi: `patches/13-meetings/meetings-settings-form.tsx`, `meetings-settings-page.tsx`, `meetings-settings-header.tsx`
- Modificati (estesi v1.33f):
  - `patches/12-time-tracking/types-settings.ts` (TWorkspaceSettingsTabs += "meetings")
  - `patches/12-time-tracking/constants-settings-workspace.ts` (WORKSPACE_SETTINGS["meetings"] + GROUPED_WORKSPACE_SETTINGS.FEATURES += meetings)
  - `patches/12-time-tracking/sidebar-item-icon.tsx` (Calendar icon mapping)
  - `patches/12-time-tracking/routes-core.ts` (route /settings/meetings)
- `build.bat`: 3 nuove copy step v1.34g (form + page + header) + index.ts re-export
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34g

### Niente backend changes
La feature flag `meetings_admin_audit_mode` era gia' supportata da v1.34b (`get_workspace_feature(workspace, "meetings_admin_audit_mode", False)` in meeting-view.py). v1.34g aggiunge solo l'UI per il toggle.

### Cosa rimane fuori dall'MVP (rinviato)
- Per-user reminder default in Profile (richiede toccare profile preferences store, surface piu' grande). v1.34h se servisse.
- v1.35: RRULE recurrence + magic link RSVP per external + conflict detection + CSV export.
- Activity feed entry per linkare/cancellare meeting (rimandato a v1.34h).

---

## [v1.34f-2] - 2026-05-02 (Meetings: detail modal + list + create modal Plane-native layout)

### Cambiato
- **Detail modal** completamente riscritto con asset Plane stock:
  - Header pulito: icona Calendar in box `size-8 rounded-md bg-accent-primary/10`, titolo `text-base font-semibold text-primary`, subtitle inline con range orario + badge cancelled/audit-only.
  - Sezione "Properties" con `<SidebarPropertyListItem>` (asset stock) per Organizer (`UserCirclePropertyIcon`), When (`StartDatePropertyIcon`), Location (Lucide MapPin), Reminder (Lucide Bell). Stesso pattern visuale del sidebar issue stock.
  - Sezione "Your RSVP" con header `text-body-xs-medium` + StatusBadge a destra + button group sotto.
  - Sezione "Attendees" con header che include `MembersPropertyIcon` (asset stock) + count + "+ Add" inline. Avatar interni renderizzati con `<ButtonAvatars>` (asset stock di Plane), avatar esterni con fallback iniziali in box `bg-surface-2`.
  - Sezione "Linked work items" con icon `Link2` + project_identifier in `font-mono` per look codice.
- **List page (/meetings/)**: tabella riscritta con palette semantica:
  - Wrapper `rounded-md border border-subtle bg-surface-1`.
  - Header `text-11 uppercase text-secondary`.
  - Righe `border-b border-subtle hover:bg-surface-2`.
  - Cells `text-13`, icon `text-placeholder`, label `text-secondary`, primary text `text-primary`.
  - Empty state `border border-dashed border-subtle`.
- **Create/Edit modal**: stesso refresh:
  - Header con icona in box accent-primary/10.
  - Input class condivisa `border-subtle bg-surface-1 focus:border-accent-primary`.
  - Label class condivisa `text-body-xs-medium text-secondary`.
  - Border separatori `border-subtle`.
  - Error inline `bg-danger-primary/10`.

### Asset Plane stock riusati
- `SidebarPropertyListItem` (`@/components/common/layout/sidebar/property-list-item`)
- `ButtonAvatars` (`@/components/dropdowns/member/avatar`)
- `UserCirclePropertyIcon`, `StartDatePropertyIcon`, `MembersPropertyIcon` (`@plane/propel/icons`)
- `Button` (`@plane/propel/button`) con varianti stock
- `ModalCore` + `EModalPosition` + `EModalWidth` (`@plane/ui`)
- Palette: `bg-surface-1/2`, `border-subtle`, `text-primary/secondary/placeholder`, `text-13/11`, `text-body-xs-medium`, `bg-accent-primary/10`, `bg-success-primary/10`, ecc.

### File toccati
- `patches/13-meetings/meeting-detail-modal.tsx` (riscritto)
- `patches/13-meetings/meeting-create-modal.tsx`
- `patches/13-meetings/meetings-root.tsx`
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34f-2

---

## [v1.34f-1] - 2026-05-02 (Meetings: palette Plane semantica + Calendar block omogeneo)

### Fixato
- **Meeting block nel Calendar**: i miei chip blu generici (`bg-blue-50` + `border-blue-200`) erano stilisticamente fuori contesto rispetto agli issue card stock. Riscritto `CalendarMeetingBlocks` replicando ESATTAMENTE la struttura visuale di `CalendarIssueBlock` stock:
  - `bg-surface-1 hover:bg-surface-2` (palette Plane invece di blu Tailwind)
  - `h-10 md:h-8` altezza fissa (allineata agli issue card)
  - `rounded-sm border-b border-subtle md:border-[1px]` (border identico)
  - `text-13 md:text-11` typography Plane
  - Stripe verticale colorata (`w-0.5`, `bg-accent-primary`) — uso il blu accent Plane per distinguere visivamente il meeting dall'issue (che usa lo state color del progetto). Stesso pattern di `<span style={{backgroundColor: stateColor}} />` stock ma con classe semantica.
  - Icona Calendar piccola accanto allo stripe.
  - Ora di start (formattata) come "identifier" (analogo a O-17 sequence id).
  - Titolo truncated.
  - RSVP status dot (`size-1.5 rounded-full`) solo se diverso da accepted (default ok), con palette success/warning/danger.
- **Detail modal e List page**: sostituiti TUTTI i colori Tailwind generici (`bg-green-100`, `text-red-700`, `bg-yellow-100`, `text-blue-800`, etc.) con la palette semantica Plane:
  - `bg-success-primary/10 text-success-primary` (accepted)
  - `bg-warning-primary/10 text-warning-primary` (tentative, audit-only)
  - `bg-danger-primary/10 text-danger-primary` (declined, cancelled, error)
  - `bg-accent-primary/10 text-accent-primary` (invited)
- Typography: `text-[11px]` -> `text-11` (Plane semantic typography token).

### File toccati
- `patches/13-meetings/calendar-meeting-blocks.tsx` (riscritto seguendo pattern CalendarIssueBlock stock)
- `patches/13-meetings/meeting-detail-modal.tsx`
- `patches/13-meetings/meeting-create-modal.tsx`
- `patches/13-meetings/meetings-root.tsx`
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34f-1

---

## [v1.34f] - 2026-05-02 (Meetings MVP slice 6: overlay nelle Calendar view stock)

### Aggiunto
- **`MeetingsCalendarProvider` (context)** — wrappa `<CalendarChart/>` in `base-calendar-root.tsx`. Fetcha UNA VOLTA i meeting nel range del mese visibile (filtrato a `project=current` se in project context, altrimenti workspace-level). Indexa per data ISO YYYY-MM-DD via `useMemo`. Re-fetch automatico quando cambia mese.
- **`useMeetingsForDate(date)` hook** — consumer per le day cells.
- **`CalendarMeetingBlocks` componente** — renderizza i meeting di un giorno come chip blu compatti (icona Calendar + ora di start + titolo, distinti visivamente dagli issue card). Click apre `MeetingDetailModal` (riuso v1.34d).
- **`issue-blocks.tsx` full-replacement** — aggiunge `<CalendarMeetingBlocks date={date}/>` dopo gli issue blocks dentro le day cells.
- **`base-calendar-root.tsx`** — esteso v1.08 con il wrap del provider.

### Privacy by design
L'endpoint `GET /workspaces/<slug>/meetings/?from=&to=` filtra gia' lato backend per `Q(created_by) | Q(attendees__user)`. Quindi nelle Calendar view stock l'utente vede SOLO i meeting di cui e' creator o attendee. Niente leak di meeting privati ad altri membri del progetto.

### Skip rule
- Meeting cancellati (`is_cancelled=true`): non renderizzati (rimangono visibili solo nel detail modal o nel tab "Past/Cancelled" della pagina /meetings/).
- Meeting audit-only (admin con feature flag): non renderizzati (sono metadata informativi, non meeting dell'utente).

### Coverage
Funziona automaticamente in tutte le 6 root del Calendar perche' tutte usano `BaseCalendarRoot`:
- workspace-level (`workspace-views` calendar layout)
- project-level (`projects/<id>/issues` calendar layout)
- profile (`profile/<userId>/<viewId>` calendar layout)
- cycle, module, team_view, project_view (idem)

### File toccati
- Nuovi: `patches/13-meetings/meetings-calendar-context.tsx`, `calendar-meeting-blocks.tsx`, `calendar-issue-blocks.tsx` (full-replacement)
- Modificato: `patches/01-layouts/base-roots/base-calendar-root.tsx` (esteso v1.08 con wrap provider)
- `build.bat`: 3 nuove copy step v1.34f + index.ts re-export aggiornato (provider + meeting blocks)
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34f

### Cosa NON fa in v1.34f (in arrivo)
- v1.34g: Settings UI per audit mode toggle + per-user reminder default in Profile
- Toggle "Show meetings" on/off nel header Calendar (off-default per chi non vuole il clutter): rinviato, surface piccola, default ON e' ragionevole
- Multi-day events (meeting che spannano piu' giorni): in v1.34f mostriamo solo nel giorno di start_at. Per supportare span -> renderizzare in tutti i giorni coperti, possibile estensione futura

---

## [v1.34e-3] - 2026-05-02 (Meetings: peek non si chiude piu' cliccando dentro modale)

### Fixato
- Aprendo `MeetingCreateModal` o `MeetingDetailModal` dal peek panel dell'issue, qualunque click dentro la modale (input, button, etc.) causava la chiusura del peek e quindi lo smontaggio della modale stessa (che e' figlia React di `IssueMeetingsProperty`).
- Causa: il peek stock usa l'hook `usePeekOverviewOutsideClickDetector` che chiude il peek su click fuori dal suo ref. La nostra modale viene renderizzata da HeadlessUI Dialog in un portal a `document.body` — quindi DOM-fuori dal peek panel. Ogni click dentro la modale sembra "fuori" al peek.
- Plane stock prevede gia' un escape: il hook controlla `event.target.closest("[data-prevent-outside-click]")` e, se trova l'attributo, salta la chiusura del peek.
- **Fix**: aggiunto attributo `data-prevent-outside-click="meeting-modal"` su un wrapper interno (form per `MeetingCreateModal`, div wrapper per `MeetingDetailModal`). Niente modifica al peek stock necessaria.

### File toccati
- `patches/13-meetings/meeting-create-modal.tsx`
- `patches/13-meetings/meeting-detail-modal.tsx`
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34e-3

---

## [v1.34e-2] - 2026-05-02 (Meetings: linked work items cliccabili nel detail modal)

### Fixato
- In `MeetingDetailModal` la sezione "Linked work items" aveva styling che faceva sembrare le righe cliccabili (`hover:bg-custom-background-90`) ma mancava `onClick`. Click non apriva l'item.
- Aggiunto `useNavigate` da react-router e handler `handleOpenIssue(issueId, projectId)` che chiude il meeting modal e naviga a `/<slug>/projects/<projectId>/issues/<issueId>` (pagina full dell'issue).
- `cursor-pointer` aggiunto esplicitamente al `<li>`.
- Bottone X (remove link, creator only): aggiunto `e.stopPropagation()` per evitare che il click triggeri anche la navigazione.
- Issue workspace-level (project_id null): per ora skip della navigazione. Fallback per quando avremo una pagina dedicata workspace-level issue (rinviato).

### File toccati
- `patches/13-meetings/meeting-detail-modal.tsx`
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34e-2

---

## [v1.34e-1] - 2026-05-02 (Meetings: sezione anche nel peek panel)

### Fixato
- **Sezione "Meetings" mancava nel peek overview panel**: in v1.34e avevo iniettato `IssueMeetingsProperty` solo in `issue-detail/sidebar.tsx` (la pagina full dell'issue, accessibile via `/projects/<id>/issues/<id>`), ma non in `peek-overview/properties.tsx` (il pannello laterale che si apre cliccando un task da una list/board/calendar view, dove l'utente passa la maggior parte del tempo).
- Plane stock ha 2 file separati per le 2 viste, anche se il contenuto e' molto simile. Ho fatto full-replacement del peek `properties.tsx` con la stessa modifica del sidebar.tsx (1 import + 1 render).

### File toccati
- Nuovo: `patches/13-meetings/peek-overview-properties.tsx` (full-replacement del peek)
- `build.bat`: 1 nuova copy step v1.34e-1
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34e-1

---

## [v1.34f-build] - 2026-05-02 (build optimization: pristine clone cache + turbo cache)

### Cambiato (build only, niente runtime)
- **`build.bat`**: ora `git clone` viene fatto UNA SOLA VOLTA. La sorgente Plane viene salvata in `%USERPROFILE%\plane-build\source-pristine\plane\` (cache pristine immutabile). Ad ogni build il working dir `%USERPROFILE%\plane-build\source\plane\` viene wipato e ripopolato copiando dalla pristine via `robocopy` (operazione locale, niente rete).
  - **Saving stimato**: ~30-60s + ~100MB di rete per build.
  - Per aggiornare upstream Plane: lanciare `build.bat refresh` (cancella la pristine cache e ri-clona).
- **`Dockerfile.custom-web`**: aggiunto BuildKit cache mount per turbo. Variabile `TURBO_CACHE_DIR=/turbo-cache` + `--mount=type=cache,id=turbo-cache,target=/turbo-cache` sul `RUN pnpm turbo run build`. Risultato: turbo legge la cache dei build precedenti e skipa i task il cui input non e' cambiato.
  - **Saving stimato**: 5-15min su rebuild che toccano solo pochi file (es. patch a un singolo .tsx).
  - Il cache mount e' persistente tra build (BuildKit lo mantiene finche' il Docker daemon non viene ripulito).

### Note
- pnpm package store gia' era cachato (`--mount=type=cache,id=pnpm-store`) — invariato.
- `Dockerfile.api` non e' stato toccato (build piu' rapida, pip installs gia' veloci, modifica cieca rischiosa).
- Niente impatto runtime: l'output dei container web/api e' identico.

---

## [v1.34e] - 2026-05-02 (Meetings MVP slice 5: Issue ↔ Meeting integration)

### Aggiunto
- **Sezione "Meetings" nel sidebar dell'issue detail** (`apps/web/core/components/issues/issue-detail/sidebar.tsx`, full-replacement):
  - Posizionata sotto `IssueWorklogProperty` e prima di `WorkItemAdditionalSidebarProperties`.
  - Mostra lista compatta dei meeting linkati al task (titolo, range orario, attendee count, location truncata).
  - Bottone "+ Schedule" -> apre `MeetingCreateModal` precompilato con `initialIssueId` + `initialProjectId`.
  - Click su un meeting -> apre `MeetingDetailModal`.
  - Empty state: "No meetings linked. Click 'Schedule' to add one."
  - Filtra meeting cancellati di default (visibili solo nel detail modal).
- **Componente `IssueMeetingsProperty`** (`patches/13-meetings/issue-meetings-property.tsx`):
  - Stesso pattern di `IssueWorklogProperty` (v1.33c): standalone block, non wrappato in `SidebarPropertyListItem`.
  - Riusa `useIssueMeetings(slug, issueId)` hook gia' presente in v1.34d (legge `GET /workspaces/<slug>/issues/<id>/meetings/`, gia' filtrato per visibility lato backend).
- **`MeetingCreateModal` accetta 2 nuove props opzionali**:
  - `initialIssueId`: se presente, dopo POST `/meetings/` chiama silently POST `/meetings/<id>/issue-links/` con `{issue_id}`. L'errore di link non blocca il flusso (meeting creato comunque, log in console).
  - `initialProjectId`: pre-popola il dropdown project nel form (default per scheduling da task).

### Privacy by design
- L'endpoint `GET /workspaces/<slug>/issues/<id>/meetings/` (v1.34b) ritorna solo i meeting linkati di cui l'utente e' creator/attendee. Quindi un membro del progetto che apre un task vede SOLO i meeting di cui e' parte attiva — niente leak di meeting privati ad altri membri.

### I 3 modi di scheduling sono ora tutti accessibili da UI
| Modo | Come | Risultato |
|---|---|---|
| Per progetto (orfano) | `/meetings/` -> "+ Create meeting" -> seleziona project | `Meeting(project=X, no issue_links)` |
| Su task singolo | apri task -> sidebar Meetings -> "+ Schedule" | `Meeting(project=task.project_id) + MeetingIssueLink(issue=task)` |
| Slegato | `/meetings/` -> "+ Create meeting" -> "Workspace-level (no project)" | `Meeting(project=NULL, no issue_links)` |

### File toccati
- Nuovo: `patches/13-meetings/issue-meetings-property.tsx`
- Nuovo: `patches/13-meetings/issue-detail-sidebar.tsx` (full-replacement del sidebar.tsx stock con +2 righe rispetto a stock)
- Modificato: `patches/13-meetings/meeting-create-modal.tsx` (props `initialIssueId` + `initialProjectId` + auto-link post-create)
- `build.bat`: 2 nuove copy step v1.34e + index.ts re-export aggiornato
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34e

### Cosa NON fa in v1.34e (in arrivo)
- v1.34f: Calendar overlay tasks/meetings/both nelle Calendar view esistenti (project + workspace), filtrato per partecipanti
- v1.34g: Settings UI per audit mode toggle + per-user reminder default in Profile
- (Opzionale) Activity feed entry "Meeting *titolo* scheduled / unlinked / cancelled" — rinviato perche' richiede integrazione con `IssueActivity` Celery task + serializer + frontend rendering, surface ampia per benefit limitato. Si valuta per una eventuale v1.34h.

---

## [v1.34d-1] - 2026-05-02 (hotfix grafico: ModalCore invece di Dialog custom)

### Fixato
- **Modal create + detail rendevano inline invece che in overlay**: il pattern `<Dialog>...<div className="fixed inset-0 bg-custom-backdrop opacity-50" />` non si attivava (probabile problema di compilazione Tailwind sulla classe `bg-custom-backdrop` o di interazione con `<Transition.Root>` in mode portal). Risultato: il contenuto del modal finiva nel flusso normale della pagina, sovrapposto alla tabella sottostante.
- Refactor: entrambi i modal (`MeetingCreateModal`, `MeetingDetailModal`) ora usano `ModalCore` da `@plane/ui` (lo stesso componente che Plane stock usa per ogni altro modal — DeactivateAccountModal, MoveIssueModal, ecc.). `ModalCore` gestisce internamente:
  - `<Transition.Root>` + `<Dialog as="div" className="relative z-30">`
  - `<div className="fixed inset-0 bg-backdrop transition-opacity" />` (backdrop)
  - `<div className="fixed inset-0 z-30 overflow-y-auto">` (wrapper centratura)
  - `<Dialog.Panel className="bg-surface-1 ...">` (pannello con border + ombra)
- Le props `position={EModalPosition.CENTER}` e `width={EModalWidth.XL}` (create) / `EModalWidth.XXL` (detail) tengono dimensioni e posizionamento coerenti con gli altri modal stock.
- Input/textarea/select hanno ora classe condivisa `inputClass` con border `custom-border-200` + bg `custom-background-100` + focus border `custom-primary-100` (matching pattern stock).

### File toccati
- `patches/13-meetings/meeting-create-modal.tsx`
- `patches/13-meetings/meeting-detail-modal.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.34d-1)

---

## [v1.34d] - 2026-05-02 (Meetings MVP slice 4: UI page + create/edit/RSVP modals)

### Aggiunto
- **Pagina `/meetings/`** workspace-level con vista lista in tabella, ordinata per `start_at`, suddivisa in:
  - **Upcoming** (end_at >= now AND non cancellati)
  - **Past / Cancelled**
  - Colonne: Title, When, Location, Attendees count, My RSVP, Organizer.
- **Modal Create Meeting** (Headless UI Dialog) con campi: title, description, location, start_at, end_at, all_day toggle, reminder_minutes_before (default 15), project picker (escluso il workspace fittizio).
- **Modal Detail/Edit/RSVP**:
  - Info principali (title, when, location come link cliccabile, description, organizer, reminder).
  - **RSVP buttons** (Accept / Tentative / Decline) per l'utente corrente se attendee, con `StatusBadge` colorata.
  - **Attendees list**: avatar iniziali + name + email + StatusBadge. Creator ha inline form "Add attendee" (workspace member dropdown OR external email + display_name) e bottone X per rimuovere.
  - **Issue links list**: project_identifier + sequence_id + name. Creator puo' rimuovere.
  - Footer (creator only): "Edit" (riapre il Create modal in `mode="edit"` con valori pre-popolati) + "Cancel meeting" (conferma + `prompt` per reason).
  - Audit-only meetings: render light (niente description/attendee details, niente edit/RSVP).
- **Service frontend** `meeting.service.ts` con tipi co-located (`IMeeting`, `IMeetingAttendee`, `IMeetingIssueLink`, `IMeetingCreatePayload`, `IMeetingListFilters`, ecc). Metodi: `list`, `retrieve`, `create`, `update`, `cancel`, `rsvp`, `addAttendee`, `removeAttendee`, `addIssueLink`, `removeIssueLink`, `issueMeetings`.
- **Hook SWR** `use-meetings.ts`: `useMeetings(slug, filters)` list, `useMeetingDetail(slug, id)` con nested attendees + issue_links, `useIssueMeetings(slug, issueId)`.

### Decisione architetturale
- **Tipi co-located nel service file** (non in `packages/types`) per evitare full-replacement di `packages/types/src/index.ts` (hub fragile a regressioni upstream Plane).
- **DateTime input nativo** `<input type="datetime-local">` per l'MVP. Switcha a `<input type="date">` se `all_day=true`. Helper `dateTimeLocalToISO` / `isoToDateTimeLocal` per round-trip.
- **State modal locale al page**: i 2 modal (create + detail) sono state-locale a `MeetingsRoot`, niente context globale. Il "Edit" interno a `MeetingDetailModal` istanzia un secondo `MeetingCreateModal` in `mode="edit"`.
- **Sidebar entry**: estese le 4 file di v1.33f (constants-workspace.ts + sidebar-helper.tsx + sidebar-item-base.tsx + routes-core.ts) per aggiungere `meetings` con `Calendar` icon. Access include `GUEST` (un guest puo' essere invitato a un meeting).

### File toccati
- Nuovi: `patches/13-meetings/meeting-service.ts`, `use-meetings.ts`, `meetings-root.tsx`, `meeting-create-modal.tsx`, `meeting-detail-modal.tsx`, `meetings-page.tsx`, `meetings-layout.tsx`, `meetings-header.tsx`
- Modificati (estesi v1.33f): `patches/12-time-tracking/constants-workspace.ts`, `sidebar-helper.tsx`, `sidebar-item-base.tsx`, `routes-core.ts`
- `build.bat`: 8 nuove copy step v1.34d (4 component + 1 service + 1 hook + 3 page-files + 1 mkdir + index.ts inline)
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34d

### Cosa NON fa in v1.34d (in arrivo)
- v1.34d-2: Day/Week/Month grid view (riusa il Calendar layout esistente)
- v1.34e: Calendar overlay tasks/meetings/both
- v1.34f: Settings UI per audit mode toggle + per-user reminder default in Profile
- Issue link picker (per ora la lista issue_links e' read-only nel detail; per linkare bisogna usare l'API direttamente o aspettare l'integrazione issue-detail in v1.34d-3)

---

## [v1.34c] - 2026-05-02 (Meetings MVP slice 3: email invite/update/cancel + Celery beat reminder)

### Aggiunto
- **4 Celery `shared_task` per email** (`plane/bgtasks/meeting_email_task.py`):
  - `send_meeting_invite(meeting_id, attendee_id)` — invio email invito al singolo attendee, set `invitation_email_sent_at` su success. Idempotente.
  - `send_meeting_update(meeting_id, changes_summary)` — invio update a TUTTI gli attendees interni gia' invitati. Triggerato dal PATCH endpoint solo se cambia `title|start_at|end_at|location|all_day`.
  - `send_meeting_cancel(meeting_id, reason)` — invio cancel a TUTTI gli attendees interni gia' invitati. Triggerato dal DELETE soft-cancel.
  - `send_meeting_reminder(meeting_id, attendee_id)` — invio reminder, set `reminder_email_sent_at`. Idempotente. Skip se status='declined'.
- Tutti i task seguono il pattern di `magic_link_code_task.py`: `get_email_configuration()` legge `InstanceConfiguration` (god-mode SMTP) -> `get_connection()` -> `EmailMultiAlternatives` con HTML+plain text via `render_to_string()`.
- **Reminder beat scanner** (`plane/bgtasks/meeting_reminder_beat.py`):
  - `process_meeting_reminders(horizon_hours=24)` scansiona meeting con `start_at in (now, now+horizon]` e `cancelled_at IS NULL`.
  - Per ogni attendee interno (skip externals + status='declined' + `reminder_email_sent_at IS NOT NULL`) calcola `rmins = attendee.reminder_minutes_before OR meeting.reminder_minutes_before OR 15`.
  - Se `now in [start_at - rmins, start_at)` -> `send_meeting_reminder.delay()`.
- **Migration 0128_v134c_meeting_reminder_beat.py**: registra `PeriodicTask name='meetings.process_reminders'` con `IntervalSchedule(every=1 minute)`. Plane usa `django_celery_beat.DatabaseScheduler` quindi il PeriodicTask viene letto automaticamente al prossimo tick del beat container — niente restart richiesto.
- **HTML email templates** (`apps/api/templates/emails/meetings/`): `meeting_invite.html`, `meeting_update.html`, `meeting_cancel.html`, `meeting_reminder.html`. Inline CSS, ~560px width, palette Plane.
- **Hook nei view endpoint** (`patches/13-meetings/meeting-view.py` esteso v1.34b -> v1.34c):
  - `MeetingDetailEndpoint.patch`: snapshot pre-save + `_significant_change()` + `_changes_summary()` + `_safe_delay(send_meeting_update, ...)`.
  - `MeetingDetailEndpoint.delete`: `_safe_delay(send_meeting_cancel, meeting_id, reason)`.
  - `MeetingAttendeesEndpoint.post`: per attendee interno `_safe_delay(send_meeting_invite, meeting_id, attendee_id)`. Per esterno: NO email (v1.34c policy, ricevera' magic link in v1.35b).
- `_safe_delay()` wrapper: swallow Celery broker errors / ImportError fallback in modo che le email non bloccano mai il flusso applicativo.

### Decisione policy
- **Solo attendees interni** (user_id IS NOT NULL) ricevono email in v1.34c. External attendees hanno gia' `rsvp_token` salvato (v1.34b) ma riceveranno la prima email solo in v1.35b quando il magic link RSVP sara' cabling-completo.
- **Creator NON riceve invite**: e' auto-aggiunto come `accepted` al POST `/meetings/`, lo skip e' implicito perche' la create endpoint non chiama `send_meeting_invite` per il creator (l'invite parte SOLO da `MeetingAttendeesEndpoint.post`).

### File toccati
- Nuovi: `patches/13-meetings/meeting-email-task.py`, `meeting-reminder-beat.py`, `migration-0128-meeting-beat.py`, `email-meeting-invite.html`, `email-meeting-update.html`, `email-meeting-cancel.html`, `email-meeting-reminder.html`
- Modificato: `patches/13-meetings/meeting-view.py` (import email tasks + hook in patch/delete/attendees POST)
- `build.bat`: 8 nuove copy step v1.34c (incluso mkdir templates/emails/meetings/)
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG -> v1.34c

### Cosa NON fa in v1.34c (in arrivo)
- v1.34d: pagina UI `/meetings/` con vista Day/Week/Month + Modal create/edit + RSVP UI
- v1.34e: Calendar layout overlay Tasks/Meetings/Both
- v1.34f: Settings UI per audit mode toggle + per-user reminder default
- v1.35b: External RSVP via magic link + email invite agli external

---

## [v1.34b] - 2026-05-02 (Meetings MVP slice 2: backend endpoints + RSVP + visibility)

### Aggiunto
- **6 endpoint REST** per Meeting registrati in `urls/workspace.py`:
  - `GET /workspaces/<slug>/meetings/?from=&to=&project_id=` — list visibili (creator + attendees) ordinati per `start_at`. Esclude `cancelled_at IS NOT NULL` di default.
  - `POST /workspaces/<slug>/meetings/` — create (auto-add creator come attendee `accepted`).
  - `GET /workspaces/<slug>/meetings/<id>/` — detail con attendees+issue_links nested. Cancellati visibili.
  - `PATCH /workspaces/<slug>/meetings/<id>/` — edit (creator only).
  - `DELETE /workspaces/<slug>/meetings/<id>/` — soft-cancel (set `cancelled_at`+`cancelled_by`+`cancellation_reason`, creator only).
  - `POST /workspaces/<slug>/meetings/<id>/rsvp/` body `{status, comment?}` — solo l'attendee corrente puo' cambiare il proprio status.
  - `POST /workspaces/<slug>/meetings/<id>/attendees/` body `{user_id}` o `{external_email, display_name?}` — creator only. Esterni ricevono `rsvp_token` URL-safe 32-char (per magic link v1.35b).
  - `DELETE /workspaces/<slug>/meetings/<id>/attendees/<aid>/` — creator only, non puo' rimuovere se stesso.
  - `POST /workspaces/<slug>/meetings/<id>/issue-links/` body `{issue_id}` — creator only, valida project membership.
  - `DELETE /workspaces/<slug>/meetings/<id>/issue-links/<lid>/` — creator only.
  - `GET /workspaces/<slug>/issues/<id>/meetings/` — meetings linkati all'issue, filtrati per visibility.

### Privacy
- **Visibility filter**: `Meeting.objects.filter(workspace=W).filter(Q(created_by=user) | Q(attendees__user=user)).distinct()`. Solo creator + attendee interni vedono il meeting via `MeetingSerializer` full.
- **Audit mode**: workspace ADMIN con feature flag `workspace_feature_settings.meetings_admin_audit_mode=true` vedono i meeting altrui via `MeetingLightSerializer` (solo title + start/end + attendee_count). Le entry audit-only sono marcate `is_audit_only=true` nel response.
- **Mutazioni**: solo creator (edit/cancel/manage attendees/manage issue links). Eccezione: workspace admin "ownership transfer" se il creator e' rimosso dal workspace — non implementato in v1.34b, rinviato.

### Helpers nel view file
- `_user_is_workspace_admin(user, workspace)`, `_user_is_project_member(user, workspace, project_id)`
- `_parse_dt(value)` — ISO-8601 -> aware datetime, supporta sia `...Z` sia `...+00:00`
- `_gen_rsvp_token()` — `secrets.token_urlsafe(24)` (≈32 char URL-safe)
- `_get_visible_meetings(workspace, user)`, `_get_audit_meetings(workspace)`

### File toccati
- Nuovo: `patches/13-meetings/meeting-view.py` (6 view classes ≈ 470 righe)
- Modificato: `patches/03-backend/api-urls-workspace.py` (8 nuove path() + import)
- `build.bat`: 1 nuova copy step v1.34b
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG → v1.34b

### Cosa NON fa in v1.34b (in arrivo)
- v1.34c: invio email invite/update/cancel + Celery beat task per reminder T-15min
- v1.34d: pagina UI `/meetings/` con vista Day/Week/Month + Modal create/edit + RSVP UI
- v1.34e: Calendar layout overlay Tasks/Meetings/Both
- v1.34f: Settings UI per audit mode toggle + per-user reminder default

---

## [v1.34a] - 2026-05-02 (Meetings MVP slice 1: backend models + migration)

### Aggiunto
- **Tabella `meetings`** (migration `0127_v134a_meetings.py`):
  - Workspace-level (project nullable). Campi: `title`, `description`, `location`, `start_at`, `end_at`, `all_day`, `timezone`.
  - `reminder_minutes_before` (default 15, configurabile per-meeting dal creator).
  - Campi recurrence preparati ma NON implementati: `recurrence_rule`, `recurrence_until`, `excluded_dates` (JSONField list di date), `parent_meeting` (FK self per override singola occorrenza). Verranno usati in v1.35a con RRULE expansion.
  - Campi cancellation: `cancelled_at`, `cancelled_by` (FK User SET_NULL), `cancellation_reason`.
  - 3 indici: `(workspace, start_at, end_at)`, `(created_by, start_at)`, `(project)`.
  - `CheckConstraint` `end_at >= start_at`.
- **Tabella `meeting_attendees`**:
  - `user` XOR `external_email` (CheckConstraint). Esterni hanno `display_name` opzionale.
  - RSVP: `status` (`invited`/`accepted`/`tentative`/`declined`), `rsvp_token` (unique, per v1.35b magic link), `rsvp_comment`, `responded_at`.
  - Email tracking: `invitation_email_sent_at`, `reminder_email_sent_at`, `reminder_inapp_sent_at`.
  - Per-attendee override `reminder_minutes_before` (NULL = usa default del meeting).
  - 2 indici: `(user, meeting)` e `(meeting, status)`.
- **Tabella `meeting_issue_links`**: M2M tra meeting e issue. `UniqueConstraint(meeting, issue)`. Indice su `issue` per il pattern "meetings linkati a questo task".
- **Serializers** `MeetingSerializer` (full con attendees+issue_links nested), `MeetingAttendeeSerializer`, `MeetingIssueLinkSerializer`. Inoltre `MeetingLightSerializer` (solo metadata) per audit mode admin (v1.34b).

### Privacy by design
La privacy "solo invitati" e' enforced lato view (queryset filter) — vedi v1.34b. Il model non ha campi specifici, e' tutto basato su `Meeting.attendees` + `Meeting.created_by`. Workspace admin in audit mode vedono solo title+orario via `MeetingLightSerializer`.

### File toccati
- Nuovi: `patches/13-meetings/meeting-models.py`, `migration-0127-meetings.py`, `meeting-serializers.py`
- Modificato: `patches/12-time-tracking/plane-db-models-init.py` (aggiunto import `Meeting, MeetingAttendee, MeetingIssueLink`)
- `build.bat`: 3 nuove copy step v1.34a
- `patches/00-core/edition-badge.tsx`: CUSTOM_PATCH_TAG → v1.34a

### Cosa NON fa in v1.34a (in arrivo)
- v1.34b: endpoint CRUD + RSVP + visibility filter + audit mode flag check
- v1.34c: email invite/update/cancel + Celery beat reminder task
- v1.34d: pagina UI `/meetings/` con vista Day/Week/Month
- v1.34e: Calendar layout overlay Tasks/Meetings/Both
- v1.34f: Settings + per-user reminder default in Profile

---

## [v1.33m] - 2026-05-02 (revert filter originale People/team_issues + Subquery)

### Fixato
- **Subtask scomparsi (revert)**: le iterazioni v1.33j/k/l filtravano via i record `IssueAssignee` soft-deleted dal filter principale dell'endpoint `team_issues.py`. Side-effect: alcuni task (es. subtask "Test son") scomparivano dalla People page. L'utente ha confermato che il comportamento v1.19c originale era corretto.
- Revert al filter `assignees__id=user_id` (M2M traversal completa, include history). I side-effect del filter originale (assignee chip "+2" fantasma e Sum ore moltiplicato) sono fixati ALTROVE:
  - **Subquery per `time_logged_seconds`**: invece di annotate inline che fa JOIN su `issue_time_logs`, uso `Subquery(TimeLog.objects.filter(issue=OuterRef('pk'), user_id=...).exclude(approval_status='rejected').values('issue').annotate(total=Sum('duration_seconds')).values('total'))`. La Subquery e' calcolata 1 volta per issue, non si moltiplica.
  - **Custom Prefetch sugli assignees**: `Prefetch("assignees", queryset=User.objects.filter(issue_assignee__deleted_at__isnull=True).distinct())`. La lista `i.assignees.all()` ritorna solo gli assignee correnti, niente "+2" fantasma.
- `.distinct()` mantenuto per dedupliare le issue dalla M2M JOIN.

### Nota architetturale
La query del filter principale (`assignees__id=user_id`) attraversa il through table senza filtro su `deleted_at` (Django M2M default). Quindi un task che ha avuto Luca come assegnatario in passato (anche soft-deleted) compare. E' coerente con v1.19c (comportamento atteso). Le visualizzazioni di "current state" (chip assignee + ore) usano i filter corretti tramite Prefetch/Subquery.

### File toccati
- Modificato: `patches/03-backend/api-team-issues-view.py`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33m)

---

## [v1.33l] - 2026-05-02 (subtask fix definitivo + filtri Hours)

### Fixato
- **Subtask scomparsi (definitivo)**: il fix `Exists()` di v1.33k non ha avuto effetto pratico (Test son ancora invisibile). Cambio strategia: pre-fetch degli `issue_ids` da `IssueAssignee.objects` (con SoftDeleteManager che gia' filtra `deleted_at__isnull=True`), poi `Issue.objects.filter(id__in=issue_ids)`. Niente JOIN ambiguo sul through table, ogni issue compare 1 volta.

### Aggiunto
- **Filtri Hours nell'header della People page**: 2 dropdown propagati al backend.
  - **Period**: `Today | This week | This month | Last 30 days | All time` (default: All time)
  - **State**: `Active only | Completed | Cancelled | All states` (default: All states)
  - SWR rifetch al cambio del filter; lo stat "Hours" di ogni member si aggiorna di conseguenza.
  - Backend `team_stats.py` accetta i nuovi query params `hours_period` e `hours_states` e applica i filtri al `time_log_filter`.
  - Service `fetchWorkspaceMembersStats(slug, optionsOrProjectIds)` ora accetta options object `{ projectIds, hoursPeriod, hoursStates }` (con back-compat per la firma vecchia che passava solo `string[]`).

### File toccati
- Modificati: `patches/03-backend/api-team-issues-view.py`, `patches/03-backend/api-team-stats-view.py`, `patches/04-people-page/people-stats-service.ts`, `patches/04-people-page/people-page.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33l)

---

## [v1.33k] - 2026-05-01 (hotfix: subtask scomparsi post v1.33j)

### Fixato
- **Subtask scomparsi dalla People page**: il fix v1.33j sul through table M2M `issue_assignee__assignee_id=user_id` + `issue_assignee__deleted_at__isnull=True` poteva essere tradotto da Django come **due JOIN separati** sullo stesso through table. Risultato: il match diventava "esiste una riga IssueAssignee con assignee_id=X" AND "esiste una riga IssueAssignee con deleted_at IS NULL" (anche su righe diverse), invece di "una sola riga IssueAssignee soddisfa entrambi". Conseguenza: alcuni subtask (es. "Test son") venivano filtrati erroneamente.
- Fix `team_issues.py`: usato `Exists(IssueAssignee.objects.filter(issue=OuterRef('pk'), assignee_id=user_id, deleted_at__isnull=True))`. Subquery EXISTS che garantisce **UNA SINGOLA riga** IssueAssignee con TUTTI i criteri sulla SAME row.
- Fix `team_stats.py`: aggiunti `issue__archived_at__isnull=True` e `issue__deleted_at__isnull=True` al `time_log_filter` (sanity bound, evita ore "fantasma" sommate da log su issue archiviate o soft-deleted).

### Note
Il counter "Hours" nell'header del member continua a includere log su task in **qualsiasi state group** (active, completed, cancelled), non solo gli active. E' una scelta deliberata: rappresenta il contributo storico totale del membro. Se la coerenza con "Active 5" e' preferibile, va segnalato per fare la stessa restrizione anche alle ore.

### File toccati
- Modificati: `patches/03-backend/api-team-issues-view.py`, `patches/03-backend/api-team-stats-view.py`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33k)

---

## [v1.33j] - 2026-05-01 (hotfix: 3 bug della People page)

### Fixato
1. **Duplicate assignees + ore moltiplicate**: lo stock `IssueAssignee` e' soft-delete; assegnare/disassegnare ripetutamente lo stesso utente lasciava righe con `deleted_at` impostato. Il filter M2M `assignees__id=user_id` matchava anche le righe soft-deleted → JOIN duplicato → "+N" fantasma sugli avatar e `time_logged_seconds` moltiplicato per il numero di cancellazioni storiche.
   - Fix backend (`team_issues.py`): filter esplicito `issue_assignee__deleted_at__isnull=True` + custom `Prefetch("assignees")` filtrato con `User.objects.filter(issue_assignee__deleted_at__isnull=True)` → `i.assignees.all()` ritorna solo gli assignee attivi.
2. **Header tabella disallineato**: dopo v1.33i le righe `IssueRow` avevano 7 colonne (aggiunta "Hours") ma l'header restava a 6 → labels sballate e celle delle ore stampate sotto la colonna sbagliata. Fix: aggiunta `<span>Hours</span>` con `grid-cols-...` aggiornato per matchare la riga.
3. **Click su task name non apriva il peek-overview**: `useIssuePeekOverviewRedirection().handleRedirection()` setta lo store del peek, ma serviva `<IssuePeekOverview/>` come listener nel render tree per mostrare il modal. Mancava nella People page (e' presente solo in `AllIssueLayoutRoot` e qualche altro punto stock). Aggiunto `<IssuePeekOverview/>` in cima al `WorkspacePeoplePage`.

### File toccati
- Modificati: `patches/03-backend/api-team-issues-view.py`, `patches/04-people-page/people-page.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33j)
- `build.bat`: nessuna nuova copy step (modifiche in-place)

---

## [v1.33i] - 2026-05-01 (People page integra ore loggate)

### Aggiunto
- **Colonna "Hours"** nella tabella issues di ogni utente nella People page (icona Clock + durata `Xh Ym`). Read-only: l'edit avviene dal Time tracking widget nel sidebar issue.
- **Stat "Hours"** nell'header di ogni member, accanto a Active/Overdue. Mostra il totale ore loggate dal user nel workspace, escluso `rejected`.
- Backend `team_issues.py`: annotate `time_logged_seconds` per (user, issue), escluso `rejected`. Coalesce a 0 se nessun log.
- Backend `team_stats.py`: query separata su `TimeLog` con filtri progetti accessibili al requester, raggruppata per `user_id`, escluso `rejected`. Popola `total_logged_seconds` in ogni stats entry.

### Logica
- Le ore mostrate **escludono i log `rejected`** (coerente con v1.33h sui totali del widget e del timesheet).
- I log `pending` SI contano (work-in-progress di approval, l'utente li ha gia' loggati).
- Project access scope rispettato: l'utente vede solo ore di task in progetti dove e' member attivo.

### File toccati
- Modificati: `patches/03-backend/api-team-issues-view.py`, `patches/03-backend/api-team-stats-view.py`, `patches/04-people-page/people-stats-service.ts`, `patches/04-people-page/people-page.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33i)
- `build.bat`: nessuna nuova copy step (modifiche in-place ai file v1.18/v1.19)

---

## [v1.33h] - 2026-05-01 (hotfix: rejected logs esclusi dai totali)

### Fixato
- **Issue sidebar widget "Logged: Xh"** sommava anche i log `rejected` (lavoro respinto dall'admin). Fix: `useTimeLogs.totalSeconds` filtra `approval_status !== "rejected"`.
- **Timesheet summary card "Total"** stessa storia. Fix: aggregate backend `total_seconds=Sum(filter=~Q(approval_status="rejected"))`.

### Aggiunto
- **`rejected_seconds`** come metrica separata nell'aggregate del report endpoint.
- **Summary card "Rejected"** (rossa) appare nel timesheet solo se `rejected_seconds > 0`. Layout grid passa a 4 colonne quando visibile, resta a 3 quando non c'e' niente di respinto (no clutter per chi non usa l'approval workflow).

### Logica decisionale
- `rejected` → escluso da totali (lavoro non contato)
- `pending` → contato nei totali (work-in-progress di approvazione, ma l'utente l'ha gia' loggato)
- `approved` + `auto` → contati normalmente

### File toccati
- Modificati: `use-time-logs.ts`, `time-log-view.py`, `time-log-service.ts` (type), `timesheet-root.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33h)

---

## [v1.33g] - 2026-05-01 (hotfix: client-side gating dei consumer Time Tracking)

### Fixato
- **Toggle settings non avevano effetto sui consumer**: i 3 toggle in `/settings/time-tracking/` salvavano correttamente in DB ma `TimeTrackingSection` (sidebar issue) e `ActiveTimerBanner` (banner persistente) ignoravano i flag e si mostravano sempre.
- **`time-tracking-section.tsx`** (= stub IssueWorklogProperty CE):
  - Legge `time_tracking_enabled` (default `true` per back-compat) → ritorna `null` se OFF.
  - Legge `time_tracking_timer_enabled` (default `true`) → quando OFF nasconde badge live timer + pulsanti Start/Stop/Cancel, lasciando solo "Log time" manuale.
- **`active-timer-banner.tsx`**: ritorna `null` se uno dei due flag e' OFF.

### Pattern back-compat
- `getFlag(key, true)` come default: workspace senza record `workspace_feature_settings` continuano a vedere il widget (no breaking change per chi gia' usava la feature pre-v1.33f). Solo quando l'admin esplicitamente toggle OFF, sparisce.

### File toccati
- Modificati: `patches/12-time-tracking/time-tracking-section.tsx`, `active-timer-banner.tsx`
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33g)

---

## [v1.33f] - 2026-05-01 (Time Tracking MVP COMPLETE - slice 5b: UI Settings + Report + sidebar)

### Aggiunto
- **Settings page** `/[workspaceSlug]/settings/time-tracking/`:
  - 3 toggle (master/timer/approval) editabili solo da ADMIN. MEMBER vede read-only.
  - Voce nel sidebar settings sotto "FEATURES" con icona Clock.
  - Salvataggio one-click via PATCH `feature-settings/`. Il backend fa il merge.
- **Report page** `/[workspaceSlug]/timesheet/`:
  - Filtri: User (admin solo), Project, Period (today/this week/this month/last 30/all), Approval status.
  - Summary cards: Total / Approved / Pending hours.
  - Tabella log con avatar utente, indicatori source/status, durata, descrizione.
  - Bottoni Approve/Reject (admin only) per log pending; Delete (owner se in auto/pending, admin sempre).
- **Sidebar workspace**: nuova voce "Timesheet" sotto "People" con icona Clock (ADMIN+MEMBER).
- **Frontend infra**:
  - `services/feature-settings.service.ts` — getSettings/patchSettings (merge sui flag).
  - `hooks/use-feature-settings.ts` — SWR cache + `getFlag(key, default)` helper.

### File toccati
- Nuovi: `feature-settings-service.ts`, `use-feature-settings.ts`, `time-tracking-settings-form.tsx`, `time-tracking-settings-page.tsx`, `time-tracking-settings-header.tsx`, `timesheet-page.tsx`, `timesheet-layout.tsx`, `timesheet-header.tsx`, `timesheet-root.tsx`
- Full replacement (estende v1.19/v1.20d): `types-settings.ts`, `constants-settings-workspace.ts`, `sidebar-item-icon.tsx`, `routes-core.ts`, `constants-workspace.ts`, `sidebar-helper.tsx`, `sidebar-item-base.tsx`
- `build.bat` (~14 nuove copy step + creazione cartelle additive)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33f)

### Time Tracking MVP completo
A questo punto il sistema Time Tracking e' **end-to-end funzionante**:
- Backend (v1.33a-b-e): TimeLog + ActiveTimer + WorkspaceFeatureSettings + endpoint CRUD/approve/reject
- UI sidebar issue (v1.33c): widget Time tracking + log modal + recent entries
- Banner timer (v1.33d): visibile in tutte le pagine workspace quando timer attivo
- Settings (v1.33f): toggle 3 flag
- Report page (v1.33f): timesheet filtrabile

### Cosa **non** fa il Time Tracking MVP
- Export CSV (rinviato a v1.36, non in MVP per design choice)
- Colonne hours su People page (rinviata se vuoi farla in v1.33g separato)
- Estimate vs Actual hours percentage (mostrato come "Logged: X" senza confronto stima)

---

## [v1.33e] - 2026-05-01 (Time Tracking slice 5a: backend settings + approval)

### Aggiunto
- **Tabella `workspace_feature_settings`** (migration `0126_v133e_feature_settings.py`):
  - `OneToOneField` su workspace + `features` JSONB.
  - Tabella **generica** riusabile per Meetings (v1.34) e altre feature future: aggiungi un flag scrivendo una chiave nel JSON, senza migration.
- **Helper `get_workspace_feature(workspace, key, default)`** in `db/models/workspace_feature_settings.py`: lettura safe (mai eccezione, fallback su default) chiamabile da qualsiasi view.
- **Endpoint settings**:
  - `GET /workspaces/<slug>/feature-settings/` → `{features: {...}}` (tutti i workspace member).
  - `PATCH /workspaces/<slug>/feature-settings/` body `{features: {...}}` (ADMIN only). **Merge** sui flag esistenti, non replace totale → setting `time_tracking_enabled` non perde altri flag eventualmente settati in passato.
- **Approval workflow** attivabile via flag `time_tracking_approval_required`:
  - Quando ON, i nuovi `TimeLog` (sia da log manuale sia da timer-stop) nascono `approval_status='pending'` invece di `'auto'`.
  - Quando OFF (default), comportamento back-compat: log immediatamente `'auto'`.
- **Endpoint `/approve/` e `/reject/`**:
  - `POST /workspaces/<slug>/time-logs/<id>/approve/` (ADMIN only). 400 se status non e' `'pending'` (idempotenza protetta).
  - `POST /workspaces/<slug>/time-logs/<id>/reject/` body `{reason?: str}` (ADMIN only). Stessa logica.
  - Entrambi popolano `approved_by`, `approved_at`. Reject popola anche `rejection_reason` se fornita.

### File toccati
- Nuovi: `patches/12-time-tracking/workspace-feature-settings-model.py`, `migration-0126-feature-settings.py`, `workspace-feature-settings-view.py`
- Modificati: `patches/12-time-tracking/time-log-view.py` (gating + 2 nuove view classes), `active-timer-view.py` (gating), `plane-db-models-init.py` (registra `WorkspaceFeatureSettings`)
- Modificato: `patches/03-backend/api-urls-workspace.py` (3 import + 3 path)
- `build.bat` (3 nuove copy step v1.33e)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33e)

### Cosa NON fa in v1.33e
- v1.33f (slice 5b finale): UI Settings page con toggle, Report page `/timesheet/` con filtri + summary + approve/reject buttons per admin, colonne hours su People page.

---

## [v1.33d] - 2026-05-01 (Time Tracking MVP slice 4/5: banner timer persistente)

### Aggiunto
- **`<ActiveTimerBanner/>`** in cima al `WorkspaceLayout`. Si nasconde automaticamente quando non c'e' timer attivo (`useActiveTimer.timer === null`). Quando c'e' un timer in corso, mostra una barra sticky `top-0 z-40` con:
  - Live indicator (puntino animato verde)
  - Cronometro `HH:MM:SS` che incrementa client-side ogni 1s
  - `Working on PROJECT-NN: Issue title` → Link al task
  - Description (se settata, hidden su mobile)
  - `[Stop]` verde → crea TimeLog
  - `[X]` → confirm dialog → cancella senza log
- **Resync automatico**: il polling SWR del hook ogni 5s recupera lo stato server-side. Se l'utente ferma il timer da un'altra tab/dispositivo, il banner sparisce entro 5s nelle altre tab senza intervento.

### Layout
- Banner sticky DENTRO `WorkspaceContentWrapper` → non sovrappone `AppRail` (sidebar workspace switcher) ne' `WorkspaceSidebar` (project list). Occupa solo la larghezza dell'area main content e si comporta come una "info bar" a scorrimento.
- Z-index 40: sopra il contenuto della pagina, sotto i modal (z-50+) e sotto il sistema di toast.
- Quando assente, zero impatto sul layout (return null), quindi le pagine workspace non shiftano.

### Edge cases
- **Timer fermato da altro client**: il banner sparisce entro 5s grazie al polling SWR.
- **Issue eliminata mentre timer girava**: il backend (v1.33b) `stop()` gestisce con `cancelled, no log created` + warning toast.
- **Click sul Link al task**: usa `react-router` Link (Plane app router), naviga senza full reload.
- **Utente non in workspace** (settings globale, profilo, ecc.): banner non viene mai renderizzato perche' non e' dentro `[workspaceSlug]/layout.tsx`.

### File toccati
- Nuovo: `patches/12-time-tracking/active-timer-banner.tsx`
- Full replacement: `patches/12-time-tracking/workspace-layout.tsx` → `apps/web/app/(all)/[workspaceSlug]/layout.tsx` (solo aggiunto `<ActiveTimerBanner workspaceSlug={workspaceSlug}/>` sopra `<GlobalModals/>`)
- `build.bat` (2 nuove copy step v1.33d)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33d)

### Cosa NON fa in v1.33d
- v1.33e (slice 5/5 finale): Settings page + approval workflow attivabile + report page `/timesheet/` + colonne ore su People page

---

## [v1.33c] - 2026-05-01 (Time Tracking MVP slice 3/5: UI sidebar issue)

### Aggiunto
- **Sostituito lo stub stock `IssueWorklogProperty`** (`apps/web/ce/components/issues/worklog/property/root.tsx` — Plane One paid, in CE ritorna `<></>`) con la nostra `<TimeTrackingSection/>`. Pattern A travestito: lo slot esiste gia' nel sidebar (detail page + peek overview) e chiama il componente con stessa signature `{workspaceSlug, projectId, issueId, disabled}`. **Niente patch ai file `sidebar.tsx` o `properties.tsx`** — il widget appare automaticamente in entrambi i contesti.

### Render TimeTrackingSection
```
┌─ Time tracking ─────────────────────────────────────┐
│ Logged: 2h 45m   [● 00:01:23 LIVE]                  │
│ [+ Log time]   [▶ Start timer] / [■ Stop] [Cancel]  │
│ • 2h 30m · Today · "fix bug"     Ciro  ✓            │
│ • 1h 15m · Yesterday · "review"  Ciro  ⏱ ⏳         │
│ + 3 more (timesheet page coming in v1.33e)          │
└─────────────────────────────────────────────────────┘
```

### Frontend infra (file nuovi)
- `services/time-log.service.ts` — CRUD + report query con totals.
- `services/active-timer.service.ts` — get/start/stop/cancel.
- `hooks/use-time-logs.ts` — SWR per issue + create/update/remove con optimistic update.
- `hooks/use-active-timer.ts` — SWR con polling 5s + revalidate-on-focus.
- `lib/format-duration.ts` — `formatDurationHM` ("2h 45m"), `formatDurationHMS` ("HH:MM:SS"), `parseDurationToSeconds` (accetta "1:30", "1h 30m", "30m", "2h").
- `components/issues/time-tracking/manual-log-modal.tsx` — form con validazione live di duration, datetime picker, description.
- `components/issues/time-tracking/recent-logs-list.tsx` — top 5 log con avatar, badges (timer/pending/rejected), delete-on-hover (solo owner).

### Edge cases UI
- **409 "timer gia' attivo su altro task"**: confirm modal "Fermo il timer su X e ne avvio uno nuovo qui?" → se si, fa stop+start atomicamente.
- **Live elapsed display**: il badge "LIVE 00:01:23" si aggiorna client-side a partire da `started_at` (no polling per il display, solo per resync ogni 5s).
- **Owner-only delete**: il bottone Trash appare solo se `current_user.id === log.user` E `approval_status in (auto, pending)`.
- **Timer su altra issue**: badge "Timer on other task" disabilitato (no start su questa) finche' l'utente non ferma l'altro.

### File toccati
- Nuovi: `patches/12-time-tracking/time-log-service.ts`, `active-timer-service.ts`, `use-time-logs.ts`, `use-active-timer.ts`, `format-duration.ts`, `manual-log-modal.tsx`, `recent-logs-list.tsx`, `time-tracking-section.tsx`
- `build.bat` (8 nuove copy step v1.33c + creazione cartella `components/issues/time-tracking`)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33c)

### Cosa NON fa in v1.33c
- v1.33d: Banner timer persistente in cima a tutte le pagine (per stop/cancel da qualsiasi schermata)
- v1.33e: Settings page + approval workflow + report page `/timesheet/` + colonne hours su People

---

## [v1.33b] - 2026-05-01 (Time Tracking MVP slice 2/5: timer start/stop)

### Aggiunto
- **Tabella `active_timers`** (migration `0125_v133b_active_timer.py`):
  - `user_id` UNIQUE (1 solo timer attivo per utente, enforced a livello DB).
  - `workspace_id`, `issue_id` (FK SET_NULL: se l'issue viene cancellata mentre il timer gira, il record sopravvive con issue=NULL e lo `stop()` lo gestisce).
  - `started_at` (auto_now_add), `description` (opzionale, settabile a start o sovrascrivibile a stop).
- **Endpoint REST**:
  - `GET /workspaces/<slug>/timer/` → ritorna l'`ActiveTimer` corrente o `204` se nessun timer attivo. Include campi annotati `issue_name`, `issue_sequence_id`, `project_identifier`, `elapsed_seconds` (calcolato server-side, baseline per il banner UI).
  - `DELETE /workspaces/<slug>/timer/` → cancella timer corrente senza creare alcun `TimeLog`.
  - `POST /workspaces/<slug>/timer/start/` body `{issue_id, description?}` → crea `ActiveTimer`. **409 Conflict** se ne esiste gia' uno (con il timer corrente nel body cosi' frontend puo' chiedere conferma "fermo l'altro?").
  - `POST /workspaces/<slug>/timer/stop/` body `{description?}` → calcola `duration_seconds = NOW - started_at`, crea `TimeLog` con `source='timer'` + `timer_started_at`, cancella `ActiveTimer`. Atomico in `transaction.atomic()`.

### Edge cases gestiti
- **Timer gia' attivo a start** → 409 + ritorna il timer corrente nel body.
- **Issue cancellata mentre timer girava** (FK è SET_NULL) → cancella timer + 200 con messaggio, **NON** crea `TimeLog` orfano.
- **Duration < 1 second** → 400 + cancel timer (impossibile in pratica, ma sanity check).
- **Duration > 7 giorni** (`TIME_LOG_MAX_DURATION_SECONDS`) → 400 con messaggio "timer probabilmente dimenticato, usa DELETE /timer/ per cancellarlo manualmente". Senza questo, il `CheckConstraint` di `time_logs` rifiuterebbe l'INSERT con un errore generico.

### File toccati
- Nuovi: `patches/12-time-tracking/active-timer-model.py`, `migration-0125-active-timer.py`, `active-timer-serializer.py`, `active-timer-view.py`
- Modificato: `patches/12-time-tracking/plane-db-models-init.py` (aggiunto import `ActiveTimer`)
- Modificato: `patches/03-backend/api-urls-workspace.py` (3 import + 3 path)
- `build.bat` (4 nuove copy step v1.33b)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG → v1.33b)

### Cosa NON fa in v1.33b (in arrivo)
- v1.33c: UI sidebar issue (Time tracking section + Manual log modal + Recent entries + Start timer button)
- v1.33d: Timer banner persistent in alto (visibile su tutte le pagine)
- v1.33e: Settings + approval workflow + report page `/timesheet/` + colonne People

---

## [v1.33a] - 2026-04-30 (Time Tracking MVP slice 1/5: backend)

### Aggiunto
- **Tabella `time_logs`** (migration `0124_v133a_time_logs.py`):
  - Campi: `workspace_id`, `project_id`, `issue_id`, `user_id`, `duration_seconds` (INT, CheckConstraint range valido: >0 e <=7 giorni), `logged_at`, `description`, `source` (`manual`|`timer`), `timer_started_at`, `approval_status` (`auto`|`pending`|`approved`|`rejected`), `approved_by_id`, `approved_at`, `rejection_reason`.
  - 4 indici: `(user, -logged_at)`, `(issue, -logged_at)`, `(workspace, logged_at)`, partial `(workspace, approval_status)` WHERE pending.
  - Soft delete via `AuditModel` (ereditato da `BaseModel`).
- **Endpoint REST**:
  - `POST/GET /workspaces/<slug>/projects/<pid>/issues/<iid>/time-logs/` → create log + list per issue
  - `GET /workspaces/<slug>/time-logs/?from=&to=&user_id=&project_id=&approval_status=` → report con paginazione + `totals` aggregati (total/approved/pending seconds)
  - `GET/PATCH/DELETE /workspaces/<slug>/time-logs/<id>/` → detail/edit/delete
- **Permessi**:
  - Create: workspace MEMBER/ADMIN, solo per se stesso, solo se member del project del task.
  - List per issue: chiunque sia project member.
  - Report query: MEMBER vede solo i propri log; ADMIN vede tutto.
  - Edit/Delete: owner finche' `approval_status in (auto, pending)`, poi solo ADMIN.
- **Serializer** `TimeLogSerializer` con annotated read-only fields (`user_display_name`, `user_avatar_url`, `issue_name`, `issue_sequence_id`, `project_identifier`) per evitare round-trip extra al frontend.

### Note design
- **`issue_id` NOT NULL** in MVP: niente "ore generiche" senza task. Si potra' allentare in futuro.
- **`approval_status='auto'`** di default: tutti i log creati ora sono immediatamente conteggiati. L'approval workflow e' attivabile in v1.33e con il setting workspace `time_tracking_approval_required`.
- **Nessun gating per feature flag** in v1.33a: gli endpoint sono live appena buildati. Aggiungeremo il check `time_tracking_enabled` quando arrivera' la pagina settings (v1.33e).

### File toccati
- Nuovi: `patches/12-time-tracking/time-log-model.py`, `migration-0124-time-logs.py`, `time-log-serializer.py`, `time-log-view.py`
- Full replacement: `patches/12-time-tracking/plane-db-models-init.py` (per registrare TimeLog nell'app `db`)
- Modificato: `patches/03-backend/api-urls-workspace.py` (3 nuove route + 1 import)
- `build.bat` (5 nuove copy step v1.33a)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG -> v1.33a)

### Cosa fa NON in v1.33a (in arrivo)
- v1.33b: ActiveTimer model + start/stop endpoint + sidebar button
- v1.33c: UI sidebar issue (Time tracking section + manual log modal + recent entries)
- v1.33d: timer banner persistent
- v1.33e: settings page + approval workflow + report page `/timesheet/` + People page columns

---

## [v1.32r] - 2026-04-30 (rollback)

### Rimosso
- **Recent issue activity dalla MyDashboard**: il blocco `<RecentActivityWidget presetFilter="issue"/>` aggiunto in v1.32 (commit precedente, mai diventato versione effettiva sul prod) si rivelava duplicato del widget Recents stock nel WorkspaceHomeView sotto. Nel workspace l'activity recente e' per lo piu' su work item, quindi i due blocchi mostravano la stessa lista. Rollback: rimossi import `RecentActivityWidget` e sezione finale da `my-dashboard.tsx`. La home torna identica a v1.31b, con la sola activity feed stock di Plane.

### File toccati
- `patches/09-dashboard/my-dashboard.tsx` (rimosso import e sezione)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG -> v1.32r)

---

## [v1.32] - 2026-04-29 (RITIRATA, mai stabile)

### Aggiunto (poi rimosso)
- ~~**Recent issue activity** dentro la MyDashboard~~ — vedi v1.32r per il rollback motivato.

---

## [v1.31b] - 2026-04-29 (hotfix bundle)

### Fixato
- **Quick-action dropdown - permission gate (defensive)**: `archived-issue.tsx`, `cycle-issue.tsx`, `module-issue.tsx` chiamavano `allowPermissions([ADMIN, MEMBER], PROJECT)` senza passare slug/projectId. In context project standard funziona perche' la helper risolve dal context, ma e' una trappola se in futuro questi dropdown vengono renderizzati in context senza projectId in URL. Pattern v1.23a applicato: leggo projectId da `useParams` e uso WORKSPACE level come fallback (`projectId ? PROJECT : WORKSPACE`).
- **Workspace draft - admin non poteva cancellare draft altrui**: `workspace-draft/delete-modal.tsx` calcolava `canPerformProjectAdminActions = allowPermissions([ADMIN], PROJECT)`. Ma i draft sono workspace-level e quindi PROJECT non si risolveva mai -> sempre false -> solo il creatore poteva cancellare. Fix: uso `EUserPermissionsLevel.WORKSPACE`. Il backend gia' applica lo stesso vincolo ("Only admin or creator can delete the work item") quindi questa e' solo la patch del check client-side.

### File toccati
- Nuovi: `patches/11-quick-actions/archived-issue.tsx`, `cycle-issue.tsx`, `module-issue.tsx`, `workspace-draft-delete-modal.tsx`
- `build.bat` (4 nuove copy step v1.31b)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG -> v1.31b)

---

## [v1.31a] - 2026-04-29 (hotfix)

### Fixato
- **Spreadsheet bianca su Workspace Views**: la table view in Workspace Views si vedeva solo passando prima per il Gantt; navigazione diretta o switch da List/Board/Calendar lasciava la schermata bianca. Causa: `WorkspaceSpreadsheetRoot` non aveva `useEffect` con `fetchIssues` come gli altri `Base*Root`. Stock Plane lo compensava con la fetch globale di `AllIssueLayoutRoot`, ma la nostra v1.16 l'aveva rimossa (rompeva il bucketing del Calendar). Risultato: il GLOBAL store restava vuoto fino a quando un altro layout (Gantt) lo riempiva come effetto collaterale. Fix: aggiunta `useEffect` in `WorkspaceSpreadsheetRoot` che chiama `fetchIssues("init-loader", { canGroup: false, perPageCount: 100 })` al mount/cambio view, con `.catch(swallowAbort)` per AbortError di layout switch.

### File toccati
- Nuovo: `patches/01-layouts/workspace-roots/spreadsheet-workspace-root.tsx`
- `build.bat` (nuova copy step v1.31a)
- `patches/00-core/edition-badge.tsx` (CUSTOM_PATCH_TAG -> v1.31a, commento)

---

## [v1.30] - 2026-04-29

### Aggiunto
- **Mini-calendario settimanale** nella MyDashboard sotto le 4 KPI cards.
- 7 colonne (Lun-Dom), ogni colonna mostra task con `target_date` quel giorno (max 5 visibili + "+N more").
- Colonna "oggi" evidenziata in accent color. Click su un task → peek-overview.
- Backend `/me/dashboard/` esteso con `week_issues` (cap 100) e `week_range`.

### Modificato
- `TDashboardResponse` esteso con `week_issues: TIssue[]` e `week_range: {monday, sunday}`.

---

## [v1.23d] - 2026-04-29 (hotfix)

### Fixato
- **Gantt drag click leak**: dopo drag di un block in Gantt, al rilascio del mouse il browser inviava un evento `click` -> peek-overview si apriva sempre. Fix in `gantt/blocks.tsx`: traccio la posizione del mouse al `mousedown` e calcolo la distanza al `click`. Se > 5px era drag -> ignoro. Se <= 5px era click vero -> apro peek.
- Solo `IssueGanttBlock` (barra) patchato. `IssueGanttSidebarBlock` (sidebar) non e' draggable, invariato.

---

## [v1.29] - 2026-04-29 — RITIRATA

### Tentato
- Sblocco di Page Move + Page Sharing tramite flag `usePageFlag` (CE) da `{false, false}` a `{true, true}`.

### Rollback
- Il `MovePageModal` in `apps/web/ce/components/pages/modals/move-page-modal.tsx` e' uno stub `return null`. Lo stesso per `PageShareControl` e `PageMoveControl`. Il flag controllava solo la visibilita' del menu, non sbloccava codice esistente. Pattern A travestito da Pattern B — la mia mappatura iniziale era ottimistica.
- Patch ritirata. File `patches/12-page-flags/` cancellato. Per averle funzionanti serve riscrivere ~1 giornata di codice (modale + header controls + verifica backend sharing). Rinviato.

---

## [v1.23c] - 2026-04-29 (hotfix bundle)

### Fixato
- **Gantt drag persistence in workspace context**. `base-gantt-root.tsx` riga 125: `updateBlockDates` esce con `Promise.resolve()` se !projectId URL → in workspace views/Your Work il drag aggiornava ottimisticamente ma niente API call → task tornavano indietro al refresh.
- Stesso fix per il resize delle estremita' (handle drag) — entrambi passano per `updateBlockDates`.

### Modificato
- In workspace context: loop manuale su `updates` chiamando `updateIssue(issue.project_id, ...)` per ogni task. Project context invariato (usa endpoint batch stock).

### Note
- Stesso pattern di v1.23a (`isEditingAllowed` PROJECT→WORKSPACE) e v1.23b (Calendar quick-add hover): sblocco di feature gated da `!projectId` URL per workspace context.

### Fixato (z-index bundle)
- **MoveIssueModal v1.24c**: era `z-20`, finiva sotto al peek-overview (z-30+). Cliccando il modale chiudeva sia il modale che il peek. Alzato a `z-[60]`.
- **BulkActionBar v1.27a**: era `z-[2]`, i dropdown (Set state/priority/assignees) erano coperti dalle righe della lista al momento dell'apertura. Alzato a `z-[40]`.

---

## [v1.27c] - 2026-04-29

### Aggiunto
- **Multi-select in Spreadsheet layout**. Stesso pattern di v1.27a su List: rimosso il gate `projectId &&` davanti al checkbox, cosi' visibile on-hover anche in workspace views.

### Note
- La barra azioni appare automaticamente: `spreadsheet-view.tsx` stock renderizza gia' `<IssueBulkOperationsRoot>`, che con v1.27a e' la nostra `BulkActionBar` con tutti i 6 pulsanti.
- Calendar/Kanban/Gantt: rinviati. UX richiede pattern dedicato (long-press / shift+click) perche' i layout non sono lineari.

---

## [v1.28] - 2026-04-29

### Aggiunto
- **Export CSV** dei task della view corrente. Pulsante "Export" nell'header di Workspace Views accanto a "Display".
- 11 colonne: Identifier, Title, State, Priority, Assignees, Start date, Target date, Project, Labels, Created by, Created at.
- Filename `<slug>-workspace-views-<YYYYMMDD>.csv` con BOM UTF-8 (Excel compatibile per accenti).
- Esporta i task del cache (rispetta filtri server-side applicati).

### Note
- Pure client-side, nessuna dipendenza extra.
- v1.28b in roadmap: XLSX (con SheetJS), export anche da project views e Your Work, custom columns picker, endpoint backend per full unpaginated export.

---

## [v1.27b] - 2026-04-29

### Aggiunto
- **Bulk change state**: dropdown stock `StateDropdown`. Visibile solo se tutti i task selezionati sono dello stesso project (state e' project-scoped). Multi-project: pulsante disabled con tooltip esplicativo.
- **Bulk change priority**: dropdown stock `PriorityDropdown`. Enum globale, sempre attivo.
- **Bulk add assignees**: dropdown stock `MemberDropdown` multiple. `projectId` passato solo se same project (altrimenti workspace-wide).
- **Bulk move to project**: nuovo `BulkMoveIssueModal` che chiama `IssueMoveService.moveIssue` (v1.24a) in loop con `Promise.allSettled`. Toast riassuntivo (success / partial / failure).

### Modificato
- `bulk-action-bar.tsx`: 4 nuove azioni inline tra count e archive/delete.

### Note
- State/priority/assignee passano per `bulkOperations` stock (`/projects/<projectId>/bulk-operation-issues/`). Group by project_id come per archive/delete.
- Move: ogni task chiamato indipendentemente; failure di uno non blocca gli altri.

---

## [v1.27a] - 2026-04-29

### Aggiunto
- **Bulk actions MVP**: Archive + Delete su N task selezionati in List layout.
- **Vera barra azioni** in fondo alla pagina (sostituisce l'upgrade banner CE "Upgrade to Plane One").
- Conferme dialog per delete e archive.
- Group by `project_id` per supportare bulk in workspace views (gli endpoint stock sono scoped per project).

### Modificato
- `list/block.tsx`: rimosso gate `projectId &&` davanti al checkbox. Il sistema multi-select stock funzionava solo in project context; ora visibile on-hover anche in workspace views/Your Work.

### Note
- Riusa il sistema stock `useMultipleSelectStore` + `selectionHelpers` (niente store custom).
- v1.27b in roadmap: Change state, Change priority, Add assignee.
- v1.27c in roadmap: Bulk move to project (riusa endpoint v1.24).
- v1.27d in roadmap: multi-select in Spreadsheet/Kanban/Calendar/Gantt.

---

## [v1.26] - 2026-04-29

### Aggiunto
- **My Dashboard** in cima alla home workspace `/<slug>/`. La home stock (sticky, recents, ecc) resta sotto.
- **Endpoint backend** `GET /api/workspaces/<slug>/me/dashboard/?user_id=<uuid>` (v1.26a).
- 4 KPI cards: Total assigned, Due today, Overdue, Due this week (today->sunday).
- Liste Today (top 5, priority desc) + Overdue (top 5, target_date asc) con click → peek-overview.
- Hero greeting localizzato sul tempo del giorno (Good morning/afternoon/evening/Working late).
- Dropdown "**View as: <user>**" per admin/member: permette di vedere la dashboard di altri utenti del workspace.
- Hook SWR con refresh interval 60s.

### Note
- Filtro overdue: solo state group in (backlog, unstarted, started). I completed/cancelled non contano.
- Access-control: solo task di project dove il REQUESTING user (non il target) e' membro attivo. Niente leak cross-project.
- Mini-calendario settimanale, recent activity feed, quick add inline: rinviati a future iterazioni.

---

## [v1.25] - 2026-04-29

### Aggiunto
- **Move modal: opzione "Workspace" (fittizio) come target** (v1.25a). Stock `joinedProjectIds` filtra il workspace project (v1.22b), quindi lo concateno manualmente in `allowedProjectIds` se ≠ current.
- **Avatar/logo del project accanto all'identifier in tutte le viste** (v1.25b). Patch su `IssueIdentifier` shared (es. `[icon] O-10` nei block dei 5 layout, peek-overview, relations, power-k, parent-select).
- **Nome del project nelle viste estese** (v1.25c). Quando `IssueIdentifier` e' chiamato con `size="md"` (caso `IssueTypeSwitcher` nel peek-overview e detail page), mostra anche `Project Name / O-10` con un separatore visivo.
- **Filter `project_id` su Your Work** (v1.25d). `profile_issues.filters` ora include `project_id` per filtrare task assegnati per project. `my_issues` lo aveva gia' da v1.17. `group_by "project"` gia' presente in entrambi da v1.17.

### Note
- `order_by "by project"` non implementato: richiederebbe modifica del queryset backend. Il `group_by "project"` e' sufficiente per la maggior parte dei casi.

---

## [v1.24] - 2026-04-29

### Aggiunto
- **Move work item across projects**. Voce "Move to project" nei kebab menu di list/kanban/spreadsheet/calendar/gantt/peek-overview.
- **Modal `MoveIssueModal`**: project picker (escluso il current), toggle "Include sub-issues" (default ON, conta i sub se disponibili), preview testuale dei campi che verranno resettati (labels, cycle, module, state mapping, assignees fuori target, parent cross-project), pulsanti Cancel/Move.
- **Service `IssueMoveService.moveIssue(slug, issueId, payload)`** che chiama il backend.
- **Hook `useMoveIssue()`**: orchestra chiamata API + cleanup ottimistico cache (rimuove dalla view corrente) + toast success con pulsante "View" che naviga al task nel nuovo project con nuovo identifier.

### Modificato
- `quick-action-dropdowns/helper.tsx`: aggiunta factory `createMoveMenuItem()` integrata in `useProjectIssueMenuItems`, `useAllIssueMenuItems`, `useCycleIssueMenuItems`, `useModuleIssueMenuItems`, `useWorkItemDetailMenuItems`.
- `all-issue.tsx`, `project-issue.tsx`, `issue-detail.tsx`: state `moveIssueModalOpen` + render del modal + pass setter ai `menuItemProps`.

### Note
- L'use case originale (recuperare task quick-creati nel "Workspace" project per sbaglio) ora si fa in 3 click: kebab -> Move to project -> seleziona target -> Move.
- Cycle/module quick actions non patchati per scope: l'use case principale e' coperto da workspace + project.
- Backend (v1.24a) integrato e validato: vedi sezioni precedenti per dettagli logica.

---

## [v1.24a] - 2026-04-29

### Aggiunto
- **Endpoint backend per move issue** tra progetti dello stesso workspace.
- `POST /api/workspaces/<slug>/issues/<issue_id>/move/` con body `{target_project_id, include_sub_issues:bool}`.
- Smart state mapping: cerca `(name, group)` match nel target project, fallback default state, ultimo fallback primo state per sequence.
- Filter assignees ai member del target project (rimuove chi non e' membro).
- Reset parent_id se cross-project dopo il move.
- Genera nuovo `sequence_id` col pattern stock (`pg_advisory_xact_lock` postgres per il target project).
- DELETE `IssueSequence` vecchia + INSERT nuova nel target.
- UPDATE `project_id`/`workspace_id` su `IssueAssignee`, `IssueLink`, `IssueAttachment`, `IssueActivity`, `IssueComment`, `IssueSubscriber`, `IssueReaction`, `IssueMention`, `IssueVersion`, `IssueDescriptionVersion`, `IssueBlocker` (entrambi i lati), `IssueRelation` (entrambi i lati).
- DELETE `CycleIssue`, `ModuleIssue`, `IssueLabel` (project-scoped).
- Se `include_sub_issues=True`: ricorsivo sui sub-issue.

### Permission
- ADMIN/MEMBER del workspace (tramite `WorkspaceEntityPermission` + `allow_permission([ADMIN, MEMBER], "WORKSPACE")`).
- ADMIN/MEMBER del target project (check `ProjectMember.role IN [20, 15]`).

### Note
- Backend only. Frontend service/store + UI in v1.24b + v1.24c.
- Test consigliato post-build via curl o Postman:
```
POST /api/workspaces/oniro/issues/<id>/move/
Body: {"target_project_id": "<other-project-id>"}
```

---

## [v1.23b] - 2026-04-28 (hotfix #2)

### Modificato
- `calendar/quick-add-issue-actions.tsx`: rimosso `if (!projectId) return null` (riga 82). Il `QuickAddIssueRoot` child gia' gestisce il fallback `workspaceHiddenProjectId` da v1.23, quindi il menu hover "+" sulle celle del calendar funziona ora in workspace views.
- Menu item "Add existing" nascosto in workspace context (richiede un `projectId` per filtrare la lista issue).

### Note
- Workspace Calendar ora ha lo stesso behavior del project Calendar: hover su una cella → "+" inline → click "Add new" → form inline → titolo + Enter → task creato con `target_date` di quella cella e `project_id = workspaceHiddenProjectId`.
- Gantt/Timeline workspace: niente file nuovo. Il fix v1.23a su `isAllowed` dovrebbe gia' aver sbloccato drag/click/handle.

---

## [v1.23a] - 2026-04-28 (hotfix)

### Modificato
- `base-list-root`, `base-kanban-root`, `base-spreadsheet-root`, `base-gantt-root`, `base-calendar-root`: `isEditingAllowed` ora usa `projectId ? PROJECT : WORKSPACE` come permission level. Senza questo, in workspace context (URL senza `projectId`) il check `allowPermissions(..., PROJECT)` ritornava sempre false → `disableIssueCreation = true` → `list-group.tsx` (e altri) filtravano via il `<QuickAddIssueRoot>` a monte di tutta la logica v1.23.
- `base-calendar-root`: aggiunto `projectId` alla destructure di `useParams()` (era stata omessa nello stock perche' non serviva).

### Note
- Bug scoperto post-build: marker v1.23 visibile, store/hook/root patchati correttamente, ma il quick-add restava invisibile. Il filtro `!disableIssueCreation` in `list-group.tsx` riga 328 nasconde il root prima ancora che possa decidere di renderizzarsi.

---

## [v1.23] - 2026-04-28

### Aggiunto
- **Quick-add inline** ora disponibile su Workspace Views (List/Kanban/Calendar/Gantt/Spreadsheet) e Your Work (assigned/created). Default project = Workspace fittizio.
- `QuickAddIssueRoot`: `resolvedProjectId = URL ?? prePopulatedData ?? workspaceHiddenProjectId`. Lazy fetch SWR via `useWorkspaceProject()` se non gia' nel store.
- `useGlobalIssueActions` e `useProfileIssueActions`: ora espongono `quickAddIssue`.
- Profile/`assigned`: auto-add `userId` a `assignee_ids` per non perdere il task dal filtro server-side.

### Modificato
- `WorkspaceIssues.quickAddIssue`: era `undefined` -> ora bind a `this.issueQuickAdd` (la logica e' gia' in `BaseIssuesStore`).
- `ProfileIssues.viewFlags`: `enableQuickAdd: true` per `assigned`/`created` (era false). `subscribed` resta off.
- `ProfileIssues.quickAddIssue`: era `undefined` -> ora bind a `this.issueQuickAdd`.

### Note
- Project views invariate: quick-add stock continua a funzionare come prima.
- Per scegliere un project diverso dal Workspace: pulsante "+ Add work item" v1.22d (modal completo con picker).
- Move task fra progetti (per quick-add nel posto sbagliato): arriva con v1.24.

---

## [v1.22e] - 2026-04-28

### Aggiunto
- **Marker visivo "Workspace task"** su `IssueIdentifier` shared (`apps/web/ce/components/issues/issue-details/issue-identifier.tsx`). Una sola patch copre tutti i 5 layout (list/kanban/calendar/gantt/spreadsheet) + peek-overview + parent-select + relations + power-k.
- Icona `Globe2` (lucide-react) + `<Tooltip>` con contenuto "Workspace task", visibile solo quando `projectId === workspaceHiddenProjectId`.

### Note
- Color `text-tertiary` per non rubare attenzione al titolo. Dimensione `size-3` o `size-3.5` in base alla prop `size` dell'identifier.
- I task di progetti reali non mostrano nulla in piu' (nessuna regressione visiva).

---

## [v1.22d] - 2026-04-28

### Aggiunto
- **Pulsante "+ Add work item"** sulle pagine workspace-level dove mancava completamente, scoperte da test utente in v1.22c.
- People page (`/<slug>/people`): `Header.RightItem` con `<Button primary>` "Add work item" che chiama `toggleCreateIssueModal(true, EIssuesStoreType.PROJECT, undefined)`.
- Your Work page (`/<slug>/profile/<userId>/...`): stesso pulsante in `Header.RightItem` accanto a `ProfileIssuesFilter`.
- Workspace Views page (`/<slug>/workspace-views/<viewId>`): pulsante prima di "Add view" gia' esistente.

### Modificato
- `IProjectStore` interface: aggiunto `workspaceHiddenProjectId: string | undefined` (era solo nella class implementation v1.22b — i consumer tipati non compilavano).

### Note
- Permission gate: ADMIN/MEMBER del workspace (`allowPermissions`). Disabilitato se non ci sono né progetti joined né workspace project.
- `allowedProjectIds=undefined` nel modal → l'utente sceglie il project nel picker (incluso il "Workspace" project in cima grazie a v1.22c).
- Il modal globale e' montato in `WorkItemLevelModals` al livello layout, quindi basta togglare `isCreateIssueModalOpen` dal command-palette store.

---

## [v1.22c] - 2026-04-28

### Aggiunto
- **UI Create work item con voce "Workspace"** in cima al picker progetto.
- `ProjectDropdown` patchato per concatenare `workspaceHiddenProjectId` (dal store v1.22b) in cima a `joinedProjectIds`.
- `IssueProjectSelect` del modal: chiama `useWorkspaceProject()` (lazy fetch + cache) + estende `renderCondition` per accettare il workspace project anche se non in `allowedProjectIds`.

### Note
- L'utente seleziona "Workspace" nel picker → il task viene creato con `project_id` del progetto fittizio. Lato DB e' un Issue normale (compare in workspace views, your-work, ecc).
- Step successivi: v1.22d (route alias `/<slug>/work-items/<id>` + marker visivo "Workspace task" nelle viste).

---

## [v1.22b] - 2026-04-28

### Aggiunto
- **Frontend store + service + hook** per progetto fittizio workspace-level (Opzione A).
- `IPartialProject.is_hidden?: boolean` aggiunto al type.
- `WorkspaceProjectService.getWorkspaceProject(slug)` — service che consuma `/api/workspaces/<slug>/workspace-project/` (backend v1.22a, lazy get_or_create idempotente).
- `useWorkspaceProject()` hook SWR-based — dedup automatico delle chiamate concorrenti, ritorna `{workspaceProject, isLoading, error}`.
- `ProjectStore.workspaceHiddenProjectId` getter — ritorna l'ID del progetto fittizio se presente nel `projectMap`.

### Modificato
- `ProjectStore`: 4 getter (`workspaceProjectIds`, `joinedProjectIds`, `archivedProjectIds`, `favoriteProjectIds`, e il filter del sidebar) ora escludono progetti `is_hidden=true`. Il progetto fittizio non appare piu' nel sidebar Projects ne' nei picker stock.

### Note
- Step successivi: v1.22c (UI modal Create work item con voce "Workspace" + visualizzazione marker workspace task), v1.22d (route `/<slug>/work-items/<id>`).

---

## [v1.22a] - 2026-04-28

### Aggiunto
- **Foundation backend per task workspace-level** (Opzione A: progetto fittizio).
- `Project.is_hidden` BooleanField default False, db_index. Marca i progetti "fittizi" (non visibili da sidebar/picker).
- Migration `0123_v122a_project_is_hidden`.
- Endpoint `GET /api/workspaces/<slug>/workspace-project/` — lazy `get_or_create` del progetto fittizio "Workspace":
  - name `"Workspace"`, identifier `"WS"` (con suffisso numerico se collide), network Secret, features cycle/module/intake/page/views disabilitate.
  - Crea i 6 default state (skip se workspace ha shared states v1.20a).
  - Sincronizza `ProjectMember` con `WorkspaceMember` attivi (additivo + idempotente).
  - Atomicita' via `transaction.atomic` (evita race condition).
- Permission: `WorkspaceEntityPermission`.

### Note
- Step successivi: v1.22b (frontend store filter is_hidden + workspaceProjectId hook), v1.22c (UI Create modal con voce "Workspace" in cima al picker), v1.22d (URL alias `/work-items/<id>` + visualizzazione marker workspace task).
- Approccio scelto: progetto fittizio invece di `Issue.project_id NULL` per evitare refactor profondo (5+ aree backend, ~10 file, 4 migration). Costo stimato 1-2 giorni vs 5-7 giorni del refactor puro.

---

## [v1.21] - 2026-04-28

### Aggiunto
- **Drag-and-drop in List view su `state_detail.group` group_by** — sblocca il drop fra le 5 colonne state-group (Backlog/Unstarted/Started/Completed/Cancelled) in workspace views, your-work e profile. Stock di Plane ammetteva drop solo su 6 group_by (state, priority, assignees, labels, module, cycle); il workspace usa `state_detail.group` perche' gli state UUID per-project non si possono raggrupare cross-project.

### Modificato
- `packages/constants/src/issue/common.ts` → `DRAG_ALLOWED_GROUPS += "state_detail.group"`. Sblocca il check `isDragAllowed` in list-group.tsx (riga 249) e quindi `isDraggingAllowed` in block.tsx (riga 112). Il toast "Drag and drop is disabled for the current grouping" non compare piu'.
- `apps/web/core/components/issues/issue-layouts/utils.tsx` → `handleGroupDragDrop` con un 9° parametro opzionale `getStatesByProject(projectId)`. Quando `groupBy === "state_detail.group"` il drop viene risolto in `state_id`: cerca uno state del project del task con `state.group === destination.groupId` e setta `updatedIssue.state_id = targetState.id`.
- `apps/web/core/hooks/use-group-dragndrop.ts` → estrae `stateMap` da `useProjectState`, costruisce `getStatesByProject` inline e lo passa al `handleGroupDragDrop`.

### Note
- Spreadsheet drag-and-drop: lo stock non ha drop fra group (le righe non sono raggruppate). Skip in v1.21.
- Vincolo: gli state del project del task devono essere nel `stateMap` (caricati). Workspace views fetchano `workspaceStates` a init, che li include tutti.

---

## [v1.20 hotfix #2b] - 2026-04-28

### Risolto
- **PATCH issue continuava a tornare 400 anche dopo hotfix #2**: scoperto via dump del codice nel container. `IssueViewSet.partial_update` passa solo `context={"project_id": project_id}` senza `workspace_id`. La mia `Q(project__isnull=True, workspace_id=self.context.get("workspace_id"))` diventava `workspace_id=None`, che non matcha nessun shared state (`workspace_id` NOT NULL su `State`).
- Fix: derivo `_ws_id` in tutti i 4 punti di validate via fallback chain — `self.instance.workspace_id` (partial_update) → `self.context.get("workspace_id")` (se passato) → `Project.objects.filter(pk=project_id).values_list("workspace_id")` (create). Garantisce che lo state shared dello stesso workspace dell'issue passi la validation.

---

## [v1.20 hotfix #2] - 2026-04-28

### Risolto
- **Backend rifiutava workspace shared state come state_id di un issue**: validation in 4 punti (`api/serializers/issue.py`, `app/serializers/issue.py` x2, `app/serializers/draft.py`) controllava `State.objects.filter(project_id=ctx.project_id, pk=state.id).exists()`. Workspace shared (project=NULL) non passava → 400 `State is not valid please pass a valid state_id`.
- Fix: condizione rilassata a `Q(project_id=ctx.project_id) | Q(project__isnull=True, workspace_id=ctx.workspace_id)`. Lo shared state resta vincolato al medesimo workspace dell'issue (no cross-workspace).

---

## [v1.20] - 2026-04-27 (v1.20d, milestone completa)

### Aggiunto
- **Workspace Settings → States**: nuova pagina `/<workspaceSlug>/settings/states/` per gestire i workspace shared states (CRUD via UI). Riusa `GroupList` e `ProjectStateLoader` di Plane stock. Permission: Admin/Member visualizzano, solo Admin edita.
- **Voce sidebar workspace settings** "States" con icona Layers nel gruppo `ADMINISTRATION`, accanto a General/Members/Billing/Export.
- **`StateDropdown` con merge automatico**: il dropdown ora mostra `project state ids ∪ workspace shared state ids`. Su `onDropdownOpen` fetcha entrambi gli scope (idempotente via `fetchedMap`).
- Nuovi componenti: `WorkspaceStateRoot` + `WorkspaceStateLoader` (analoghi di `ProjectStateRoot`), pagina + header settings.
- Route: `/:workspaceSlug/settings/states/` registrata in `routes/core.ts`.

### Modificato
- `TWorkspaceSettingsTabs` ora include `"states"`.
- `WORKSPACE_SETTINGS["states"]` aggiunto al mapping costanti + `GROUPED_WORKSPACE_SETTINGS[ADMINISTRATION]`.

### Note
- Milestone v1.20 (workspace-level shared states, Opzione 3) **completa** con questa release. Sub-versioni:
  - v1.20a: backend schema (State.project nullable + 2 conditional uniques + migration 0122 + ProjectViewSet skip)
  - v1.20b: backend API CRUD endpoints
  - v1.20c: frontend store + service (4 actions, 3 computed, 2 getter)
  - v1.20d: UI Workspace Settings + StateDropdown integration

---

## [v1.20c] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (step 3 di 4) — frontend store + service.
- `ProjectStateService`: 4 nuovi metodi REST CRUD per shared states:
  - `createWorkspaceState(slug, data)` → POST `/api/workspaces/<slug>/states/`
  - `patchWorkspaceState(slug, stateId, data)` → PATCH stesso path
  - `deleteWorkspaceState(slug, stateId)` → DELETE
  - `markWorkspaceStateAsDefault(slug, stateId)` → POST `.../mark-default/`
- `StateStore`: 4 nuove action MobX (`createWorkspaceState`, `updateWorkspaceState`, `deleteWorkspaceState`, `markWorkspaceStateAsDefault`) con optimistic update + rollback su errore.
- `StateStore`: 3 nuove computed (`workspaceSharedStateIds`, `workspaceSharedStates`, `groupedWorkspaceSharedStates`) e 2 getter (`getWorkspaceSharedStateById`, `getWorkspaceSharedDefaultStateId`).
- Guardia: gli action workspace rifiutano di operare su state project-local (e viceversa) per evitare confusione.

### Note
- Lato UI niente cambia: nessun consumer ancora usa queste API. La integrazione StateDropdown + UI Workspace Settings arrivano in v1.20d.
- Tutti gli state (project + shared) vivono nello stesso `stateMap`: la distinzione e' runtime via `state.project_id`.

---

## [v1.20b] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (step 2 di 4) — API endpoints CRUD.
- `POST /workspaces/<slug>/states/` — crea uno workspace shared state (project=NULL forzato).
- `PATCH /workspaces/<slug>/states/<uuid:pk>/` — modifica nome / colore / group / sequence / default.
- `DELETE /workspaces/<slug>/states/<uuid:pk>/` — cancella, con check default=False e nessun Issue che lo usa.
- `POST /workspaces/<slug>/states/<uuid:pk>/mark-default/` — set default=True (e reset su altri shared dello stesso workspace).

### Modificato
- `GET /workspaces/<slug>/states/` (esistente) — query estesa: include sia project states (filtrati per project membership come stock) sia tutti gli workspace shared states (`project IS NULL`), via `Q(project__isnull=True) | Q(stock-membership-filter)`. Necessario perche' v1.20a introduce shared states che non hanno project — il filtro stock li avrebbe esclusi.

### Permission
- GET (list / retrieve) aperto a Admin/Member/Guest del workspace (`WorkspaceEntityPermission`).
- POST / PATCH / DELETE / mark-default riservati a Admin (`WorkspaceAdminPermission`).

### Note
- Step successivi: v1.20c (frontend store/service), v1.20d (UI Workspace + Project settings).

---

## [v1.20a] - 2026-04-27

### Aggiunto
- **Workspace-level shared states** (Opzione 3, step 1 di 4) — backend schema.
- `State.project` diventa NULLABLE: stato con `project=NULL` + `workspace=X` e' visibile da tutti i progetti del workspace.
- Due `UniqueConstraint` condizionali separano gli scope: project-local vs workspace-shared.
- Migration `0122_v120a_workspace_level_states.py`: AlterField nullable + AlterUniqueTogether vuoto + RemoveConstraint legacy + AddConstraint x 2.
- `ProjectViewSet.create`: skippa la creazione dei 6 `DEFAULT_STATES` se esistono gia' workspace shared states (back-compat per workspace pre-v1.20a).

### Modificato
- `State` non eredita piu' da `ProjectBaseModel` (che ha `project FK NOT NULL`); definisce esplicitamente i due FK + override `save()` per popolare workspace dal project quando disponibile.

### Note
- Nessun dato esistente toccato. Tutti gli `Issue.state_id` continuano a puntare ai loro project states.
- Step successivi: v1.20b (API CRUD endpoints), v1.20c (frontend store/service), v1.20d (UI Workspace + Project settings).

---

## [v1.19c] - 2026-04-27

### Aggiunto
- **People page interattiva** (stile spreadsheet). Tutti i task nella tree espandibile sono ora editabili inline:
  - Identifier + nome → apre il peek-overview standard di Plane via `useIssuePeekOverviewRedirection`.
  - State, Priority, Start date, Target date → dropdown stock di Plane, `onChange` chiama `IssueService.patchIssue` poi `mutate(swrKey)` per rinfrescare la lista del membro.
  - Assignees → `MemberDropdown` multiple.
- **Counter Active / Overdue** sulla summary row: ora `<button>` togglabili che filtrano la tree espansa.
- **Chip state-group e timing**: clic per filtrare; clic di nuovo per reset; banner di filtro attivo con pulsante Clear.
- **Layout**: grid 6 colonne con header sticky, bordi sottili, hover, allineato ai layout stock di Plane.

### Modificato
- `patches/04-people-page/people-page.tsx` riscritto completamente. Componenti `IssueRow`, `ExpandedTree`, `MemberRow`, `FilterChip`.

---

## [v1.19b] - 2026-04-26

### Aggiunto
- **Backend**: `GET /api/workspaces/<slug>/members/<uuid:user_id>/issues/` (`patches/03-backend/api-team-issues-view.py`). Lista flat di task attivi (backlog / unstarted / started) per un membro, con `parent_id` per costruire l'albero lato client.
- **Frontend**: `PeopleStatsService.fetchMemberIssues(slug, userId)` in `patches/04-people-page/people-stats-service.ts`.

### Modificato
- People page passa da layout a card a **lista / tabella espandibile**: una riga per membro, click espande mostrando tree dei task con indent progressivo per subtask.
- Lazy-load via SWR per ogni membro (chiave `member-issues-<slug>-<id>`).

---

## [v1.19] - 2026-04-25

### Aggiunto
- **People page** (Team dashboard) come nuova rotta workspace-level `/:workspaceSlug/people`.
- Voce sidebar `people` (icona `Users` da lucide-react), accessibile a Admin e Member, posizionata sotto Projects.
- `PeopleStatsService` consuma `/members/stats/` (v1.18).
- Card per ogni membro: avatar, nome, email, badge ruolo, conteggi per state-group (backlog / unstarted / started / completed / cancelled), conteggi temporali (overdue / due_this_week / no_target_date).
- `RESTRICTED_URLS += "people"` per evitare collisione con slug progetti.

---

## [v1.18] - 2026-04-25

### Aggiunto
- **Backend**: `GET /api/workspaces/<slug>/members/stats/` (`patches/03-backend/api-team-stats-view.py`).
- Aggregati per ogni membro attivo del workspace: totali per state-group, total_active, overdue, due_this_week, no_target_date.
- Ordinamento alfabetico case-insensitive su `display_name`. Guest inclusi (role=5).
- Access control: scope workspace, conta solo issue di progetti dove il requesting user e' membro attivo.

---

## [v1.17] - 2026-04-24

### Aggiunto
- Filter parity completa fra `issues.*` (project), `my_issues.*` (workspace views), `profile_issues.*` (your work).
- `my_issues.filters`: + `state_id`, `mention_id`, `cycle_id`, `module_id` (totale 13 filtri).
- `my_issues.list/kanban.group_by/sub_group_by`: + `state`, `assignees`, `created_by`.
- `my_issues.list/kanban.order_by`: + `target_date`.
- `my_issues.kanban.extra_options.values`: + `sub_issue`.
- `my_issues.spreadsheet.order_by`: da [] a lista standard.
- `profile_issues.filters`: + `state_id`, `mention_id`, `subscriber_id` (totale 11 filtri).
- `profile_issues.list/kanban.group_by/sub_group_by`: + `state`, `created_by`.
- `profile_issues.list/kanban.order_by`: + `target_date`.

---

## [v1.16] - 2026-04-23

### Risolto
- **Calendar workspace vuoto**: rimossa la `fetchIssues` redundante di `AllIssueLayoutRoot` che vinceva la race contro la fetch grouped del Calendar (`groupedBy:target_date, perPage:4`) ritornando un array piatto e collassando il bucketing server-side. Ora la SWR root fa solo `fetchFilters`; ogni layout root gestisce la sua fetch.

---

## [v1.15] - 2026-04-23

### Risolto
- **Backend `WorkspaceViewIssuesViewSet` non leggeva `group_by`**: il viewset Django delle workspace views ignorava il param e ritornava sempre array piatto, anche se il frontend mandava `group_by=state__group`.
- Fix: portato il pattern di `WorkspaceUserProfileIssuesEndpoint` (`issue_queryset_grouper` + `issue_on_results` + `issue_group_values` + `GroupedOffsetPaginator` o `SubGroupedOffsetPaginator`) dentro `WorkspaceViewIssuesViewSet.list()`.
- Build: aggiunta `plane-api-custom:latest` con `view/base.py` patchato; `docker-compose.override.yml` ora sovrascrive anche `api`, `worker`, `beat-worker`, `migrator`.

---

## [v1.14] - 2026-04-22

### Modificato
- Augmentation `group_by` da `state` a `state_detail.group` per allinearsi all'allowed list di `kanban.display_filters`.

### Note
- Fix corretto ma insufficiente: il backend ignorava comunque il param. Risolto in v1.15.

---

## [v1.13] - 2026-04-22

### Aggiunto
- **Diagnostica file-based**: `diagnostic-server.js` (HTTP server su :9999) + `patches/99-diagnostics/diagnostic-logger.ts` (modulo `dlog(cat, msg, data)`). Tracce in `base-kanban-root`, `issue-layout-HOC`, `workspace-filter-store`, `layouts-utils`, `kanban-default`.
- Workflow: utente lancia `node diagnostic-server.js`, rebuilda, apre la Kanban; le tracce vanno in `diagnostic.log`.

---

## [v1.12] - 2026-04-22

### Modificato
- Workspace Kanban root: clone 1:1 di `profile-issues-root.tsx` stock (passa `viewId`, scope workspace-level come GLOBAL).

---

## [v1.11] - 2026-04-22

### Modificato
- Workspace Kanban root: clone 1:1 di `project-root.tsx` stock (~30 righe, pattern minimale). Rimossi `useWorkspaceIssueProperties`, `useIssues` diagnostico, useEffect tracing.

### Note
- Insufficiente: project-root non passa viewId; lo store GLOBAL senza viewId non sa quale vista fetchare. Risolto in v1.12.

---

## [v1.10] - 2026-04-22

### Risolto
- **Cascade failure Kanban → List**: `workspace-filter-store.ts` scriveva `group_by="state"` nel displayFilters condiviso quando l'utente apriva Kanban. Tornando su List, `group_by` restava "state" → `getGroupByColumns` cercava state columns → `workspaceStates` non sempre pronti → schermo bianco.
- Fix Profile-aligned:
  - Rimosso write di `group_by="state"` in `fetchFilters` + `updateFilters`.
  - `getIssueFilters` ora ritorna una **vista augmentata non-mutating** con `group_by="state"` solo quando layout=KANBAN e l'utente non ha scelto un group_by.

### Rimosso
- `kanban-default.tsx` e `list-default.tsx` v1.09 (erano solo diagnostica, non risolvevano nulla). `list-default.tsx` rimosso definitivamente in v1.19c reorg.

---

## [v1.08] - 2026-04-22

### Risolto
- **Cascade failure layout switch**: `fetchIssues` / `fetchNextIssues` / `fetchIssuesWithExistingPagination` erano fire-and-forget. Quando una fetch veniva abortita al cambio layout, `workspace.service` trasformava `AbortError` in `throw undefined`. Ora tutti i 5 base root + il `global-view.store` hanno `?.catch(swallowAbort)`.

---

## [v1.07] - 2026-04-21

### Risolto
- `getStateColumns` / `getCreatedByColumns` per scope workspace: ora usano `workspaceStates` / `workspaceMemberIds`. Prima ricadevano su `projectStates undefined` → `List/Kanban default.tsx` restituivano null → schermo bianco.

---

## [v1.06] - 2026-04-21

### Aggiunto
- Tracce dentro `issue-layout-HOC.tsx` per capire se mostra loader / empty / children.

---

## [v1.05] - 2026-04-21

### Aggiunto
- Logger categorizzato + tracce diagnostiche nel dispatcher e nel Kanban root.

---

## [v1.04] - 2026-04-21

### Aggiunto
- `entry.client.tsx` con global error logger su `window` e `onRecoverableError` (smaschera errori React minificati).
- Fix `workspace.service.ts`: 11 metodi che facevano `throw error?.response` senza `.data` ritornavano `undefined`.

---

## [v1.03] - 2026-04-21

### Modificato
- `ErrorBoundary` diagnostico spostato dentro il dispatcher `ce-views-helper.tsx`.
- Default `group_by` per Kanban nel workspace filter store.

---

## [v1.0 - v1.02] - 2026-04-20 / 21

### Aggiunto
- **5 layout (List, Board, Calendar, Table, Gantt)** sia in Workspace Views che in Your Work / Profile.
- Riscritto `profile-issues.tsx` per supportare tutti i layout.
- Riscritto workspace views helper.
- Configurato `ISSUE_DISPLAY_FILTERS_BY_PAGE.profile_issues`.
- Build script `build.bat` con clone fresco fuori OneDrive (v1.0 era dentro OneDrive, spostato in v1.02 per evitare Files On-Demand sync issues).
- Sostituito Dockerfile custom con build ufficiale Plane + patch overlay.
- Marker visibile `PATCHED v1` accanto a Community per verificare a occhio la build custom attiva.

### Risolto
- Pagina Your Work > Assigned vuota.
- ce-views-helper truncato in stock; full replacement.
- `fetchIssuesWithExistingPagination` rigetta con `undefined` (precursore della fix v1.08).

---

## Repo reorganization (2026-04-27)

Non e' una versione di feature ma una pulizia strutturale:

- Cancellato `source/plane/` (89 MB) duplicato dentro OneDrive: `build.bat` riclona gia' fresco fuori da OneDrive a ogni build.
- Cancellato `patches/__pycache__/` e `patches/list-default.tsx` (morto da v1.10).
- Riorganizzato `patches/` flat in 9 sotto-cartelle per feature: `00-core`, `01-layouts/{workspace-roots,profile-roots,base-roots,shared}`, `02-filters`, `03-backend`, `04-people-page`, `99-diagnostics`.
- Aggiornato `build.bat` con i nuovi path (40 sostituzioni).
- Aggiunti `README.md`, `CHANGELOG.md`, `.gitignore`.
- `git init` + primo commit.
