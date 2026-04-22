# Database and Source Data Notes

## Current Understanding of the New Structure

The system structure is changing from:

- Depot
- Leaders
- Commanders
- Companies

To:

- Product Center
- Leaders
- Commanders
- Companies

Based on the latest clarification and screenshot:

- `Product Center` has child types:
  - `Depot`
  - `City`
- `Leaders` has child types:
  - `Platoon`
  - `Squad`
  - `Team`
- `Team` currently has:
  - `Member`
- `Member` appears to be a role, and there may be at least one new role added beside `Member`

Important business note:

- Old raw data will no longer be used after the new implementation.
- That means we do not need to preserve the old raw-data shape for future usage.
- Because of that, we can design the new raw-data model cleanly instead of forcing backward compatibility into the main structure.

## Why This Must Be Decided First

Yes, this should be decided first.

The old model uses:

- `leads_depot_id`
- `sales_depot_id`

That worked only because the location dimension was basically `Depot`.

Now the location side is no longer just `Depot`. It is now under `Product Center`, and the actual source unit may be:

- a `Depot`
- a `City`

If we keep the old field names, the data model will become misleading very quickly because:

- a value may point to a city but still be stored in a `*_depot_id` column
- the code will keep assuming every location is a depot
- future reporting, filtering, and aggregation will become harder

So before changing uploads, tables, formulas, or visuals, we should first define the new location identity model.

## Recommended Direction

Do not keep `leads_depot_id` and `sales_depot_id` as the long-term design.

Instead, replace them with source fields that describe the actual product center unit.

Recommended new fields:

- `leads_product_center_unit_id`
- `sales_product_center_unit_id`

And optionally:

- `leads_product_center_unit_type`
- `sales_product_center_unit_type`

Where the type can be:

- `depot`
- `city`

## Confirmed Decisions

The following points are now confirmed for the new implementation:

1. `payins` does not need category-based assignment.
2. We will use a unified `product_center_units` table.
3. The raw-data uniqueness rule will be based on:
   - `date_real`
   - `agent_id`
   - `leads_product_center_unit_id`
   - `sales_product_center_unit_id`
   - `activation_product_center_unit_id`
4. Old raw data will be ignored completely and archived.
5. The publishable layer should be built from the new raw data, preferably as a view.

## Better Option: One Unified Product Center Table

The cleanest solution is to create one master table for the product-center side, for example:

- `product_center_units`

Suggested columns:

- `id`
- `name`
- `unit_type` with values like `depot` or `city`
- `code` if needed
- `parent_id` if later you need nesting
- `is_active`
- timestamps

Then raw data will reference that table, not separate depot/city tables for scoring input.

Example raw-data fields:

- `leads_product_center_unit_id`
- `sales_product_center_unit_id`

This gives several advantages:

- one foreign-key target for uploads and manual entry
- one way to filter and group product-center performance
- no misleading naming
- easier future expansion if another product-center subtype is added later

## Why I Recommend Avoiding Separate `depot_id` and `city_id` Columns in Raw Data

Possible alternative:

- `leads_depot_id`
- `leads_city_id`
- `sales_depot_id`
- `sales_city_id`

I do not recommend this for raw data because:

- only one of those fields should be filled at a time
- validation becomes more complicated
- reporting logic becomes more complicated
- every query must check multiple columns

That structure usually creates more confusion than clarity.

## Suggested Identity Model

### Product center side

Use one entity identity:

- `product_center_unit.id`

And classify it by:

- `product_center_unit.unit_type`

Example:

| id | name | unit_type |
| --- | --- | --- |
| `pcu_001` | Manila North Depot | `depot` |
| `pcu_002` | Quezon City | `city` |

Then raw data stores:

- `leads_product_center_unit_id = pcu_001`
- `sales_product_center_unit_id = pcu_002`

### Leader hierarchy side

The leadership side also looks like it is becoming more layered:

- Platoon
- Squad
- Team
- Member
- possibly another role later

So the same principle should apply there:

- do not hard-code only one role assumption if the hierarchy is still growing
- keep the participant/agent identity stable
- store role separately

Recommended pattern:

- `agents` or `participants` table keeps the person identity
- role is stored in a `role` column
- uplines are modeled with parent references such as `upline_agent_id`

If the hierarchy gets more complex later, consider a more explicit hierarchy model, but for now the immediate blocker is the product-center side.

## Recommended Raw Data Shape

For the new implementation, a cleaner raw-data record could look like this conceptually:

| field | purpose |
| --- | --- |
| `id` | raw row id |
| `date_real` | business date |
| `agent_id` | leader/member/person identity |
| `role` | optional snapshot of role at upload time |
| `leads` | metric |
| `payins` | metric |
| `sales` | metric |
| `activation` | new metric |
| `leads_product_center_unit_id` | where leads belong |
| `sales_product_center_unit_id` | where sales/payins belong |
| `activation_product_center_unit_id` | only if activation can belong to a different unit |
| `published` | publishing flag |
| `voided` | void flag |

## Important Decision About Activation

Before finalizing the raw-data schema, this must be answered:

- Does `activation` belong to the same product-center assignment as `sales`?
- Or the same as `leads`?
- Or can it belong to its own product-center unit?

If activation always follows the sales side, then you may not need:

- `activation_product_center_unit_id`

If activation can be assigned independently, then you should add:

- `activation_product_center_unit_id`

This decision affects both the DB schema and leaderboard aggregation rules.

## New Clarification: Category-Based Assignment

Latest confirmed rule:

- We will no longer base metric assignment on area.
- We will only base assignment on these two categories:
  - `Depot`
  - `City`

This means the old depot-specific metric references should be removed in the new model:

- no more `leads_depot_id`
- no more `sales_depot_id`
- no more `activation_depot_id`

Instead, each metric may point to a category entry that is either:

- a `Depot`
- a `City`

Also confirmed:

- the three metric units can belong to different categories in the same raw-data row
- example:
  - `sales` can be assigned to `Depot`
  - `activation` can be assigned to `City`

This is an important rule because it means metric assignment must be independent per metric.

## Updated Recommendation for Metric Assignment

Because each metric can point to a different category, the raw-data model should treat each metric assignment separately.

Recommended fields:

- `leads_product_center_unit_id`
- `sales_product_center_unit_id`
- `activation_product_center_unit_id`

Confirmed rule:

- `payins` does not need its own category assignment field.

## Recommended Raw Data UID Strategy

Since old raw data will no longer be used after the new implementation, the new UID can be designed around the new metric-assignment model.

If the business rule allows the same agent and date to appear only once for a specific exact combination of metric assignments, then the raw-data identity should include:

- `date_real`
- `agent_id`
- `leads_product_center_unit_id`
- `sales_product_center_unit_id`
- `activation_product_center_unit_id`

That means the UID should represent the full scoring identity of the row, not just the person and date.

Conceptually:

`raw_data_uid = date + agent + leads_unit + sales_unit + activation_unit`

This is much better than the old depot-only identity because it reflects the new actual business structure.

## Updated Raw Data Shape

For the new implementation, the raw-data record should now be thought of more like this:

| field | purpose |
| --- | --- |
| `id` | raw row id |
| `date_real` | business date |
| `agent_id` | participant identity |
| `leads` | metric |
| `payins` | metric |
| `sales` | metric |
| `activation` | metric |
| `leads_product_center_unit_id` | assignment for leads |
| `sales_product_center_unit_id` | assignment for sales |
| `activation_product_center_unit_id` | assignment for activation |
| `published` | publishing flag |
| `voided` | void flag |

## Practical Thought on This Direction

I think this is the correct direction.

Why:

- it matches the real business rule better
- it avoids fake naming based on depot-only assumptions
- it supports mixed assignment across metrics
- it gives you a clean and stable raw-data UID design

The main caution is this:

- once each metric can point to a different category unit, aggregation logic becomes more explicit

For example:

- leaderboard totals for `sales` must group by `sales_product_center_unit_id`
- leaderboard totals for `activation` must group by `activation_product_center_unit_id`
- leaderboard totals for `leads` must group by `leads_product_center_unit_id`

That is fine, but it should be intentional in the data model and service layer.

## Revised Direct Answer

Yes, this gives you a much more proper UID for new raw data.

I agree with the direction:

- do not bind identity to depot-only fields anymore
- let each metric have its own assigned category unit
- build the new raw-data UID from the exact metric-to-category assignment combination

That is a stronger foundation for the new implementation than trying to stretch the old `sales_depot_id` and `leads_depot_id` model.

## Current Recommended Database Direction

At this point, the clean database direction is:

- create a new `product_center_units` table
- create a new raw table for the new implementation
- archive the old raw-data table and stop using it for the new flow
- build the publishable layer as a view from the new raw table

Suggested naming:

- `product_center_units`
- `raw_data_v2`
- `publishable_raw_data_v2`

If you want the final names to be cleaner in production, we can later rename them to:

- `product_center_units`
- `raw_data_new`
- `publishable_raw_data_new`

or eventually replace the old names entirely after cutover.

## Proposed Schema

This section turns the confirmed decisions into a practical first-pass database design.

### 1. `product_center_units`

Purpose:

- master table for all product-center assignment units
- replaces depot-only assignment logic
- supports both `depot` and `city`

Suggested columns:

| column | type | notes |
| --- | --- | --- |
| `id` | `uuid` or `text` | primary key |
| `name` | `text` | display name |
| `unit_type` | `text` | only `depot` or `city` |
| `code` | `text` | optional short code |
| `is_active` | `boolean` | default true |
| `created_at` | `timestamptz` | default now() |
| `updated_at` | `timestamptz` | default now() |

Recommended constraints:

- primary key on `id`
- check constraint: `unit_type in ('depot', 'city')`
- unique constraint if needed on `(unit_type, name)`

Recommended notes:

- keep this table focused on assignment identity
- do not split this back into separate raw scoring references for depot and city

### 2. `raw_data_v2`

Purpose:

- new source-of-truth table for the new implementation
- stores the 4 scoring metrics
- stores category assignment independently per metric where needed

Suggested columns:

| column | type | notes |
| --- | --- | --- |
| `id` | `text` or `uuid` | primary key |
| `date_real` | `date` | business date |
| `agent_id` | `text` or `uuid` | participant/leader identity |
| `leads` | `numeric` or `integer` | default 0 |
| `payins` | `numeric` or `integer` | default 0 |
| `sales` | `numeric` | default 0 |
| `activation` | `numeric` or `integer` | default 0 |
| `leads_product_center_unit_id` | `text` or `uuid` | FK to `product_center_units` |
| `sales_product_center_unit_id` | `text` or `uuid` | FK to `product_center_units` |
| `activation_product_center_unit_id` | `text` or `uuid` | FK to `product_center_units` |
| `published` | `boolean` | default false |
| `voided` | `boolean` | default false |
| `void_reason` | `text` | nullable |
| `voided_at` | `timestamptz` | nullable |
| `voided_by` | `text` or `uuid` | nullable |
| `publish_reason` | `text` | nullable |
| `created_at` | `timestamptz` | default now() |
| `updated_at` | `timestamptz` | default now() |
| `created_by` | `text` or `uuid` | optional |
| `updated_by` | `text` or `uuid` | optional |

Recommended constraints:

- primary key on `id`
- foreign key from each `*_product_center_unit_id` to `product_center_units(id)`
- foreign key from `agent_id` to your participant/agent table
- check constraints to keep metric values non-negative
- unique constraint on:
  - `date_real`
  - `agent_id`
  - `leads_product_center_unit_id`
  - `sales_product_center_unit_id`
  - `activation_product_center_unit_id`

Recommended UID strategy:

If you want deterministic IDs like the current system, the `id` can be computed from:

- `date_real`
- `agent_id`
- `leads_product_center_unit_id`
- `sales_product_center_unit_id`
- `activation_product_center_unit_id`

Conceptually:

`id = date_real + '_' + agent_id + '_' + leads_unit + '_' + sales_unit + '_' + activation_unit`

That is fine if:

- all parts are guaranteed present
- the application controls ID generation consistently

If you prefer simpler inserts, use a generated UUID as PK and keep the uniqueness rule as a separate unique index.

My recommendation:

- use a UUID primary key
- enforce the business identity with a unique index

That usually gives better flexibility.

### 3. `publishable_raw_data_v2`

Purpose:

- publishable read layer for the public view and any ranking queries
- built from `raw_data_v2`
- excludes rows that should not appear publicly

Recommended design:

- make this a SQL view, not a physical table

Why a view is a good fit here:

- no duplicate storage
- no sync issues between raw and publishable
- simpler publishing logic if `published` and `voided` remain flags on `raw_data_v2`

Suggested logic:

- source from `raw_data_v2`
- only rows where `published = true`
- exclude `voided = true`

Conceptual definition:

```sql
create view publishable_raw_data_v2 as
select
  id,
  date_real,
  agent_id,
  leads,
  payins,
  sales,
  activation,
  leads_product_center_unit_id,
  sales_product_center_unit_id,
  activation_product_center_unit_id,
  created_at,
  updated_at
from raw_data_v2
where published = true
  and voided = false;
```

If public queries need product-center names directly, you can either:

- keep the view minimal and join later in the app/service layer, or
- create a richer public-facing view with joined names

For maintainability, I recommend:

- keep `publishable_raw_data_v2` close to raw structure
- do joins in service logic unless performance forces a richer view

## Suggested Indexes

For `product_center_units`:

- index on `unit_type`
- optional unique index on `(unit_type, name)`

For `raw_data_v2`:

- unique index on:
  - `(date_real, agent_id, leads_product_center_unit_id, sales_product_center_unit_id, activation_product_center_unit_id)`
- index on `agent_id`
- index on `date_real`
- index on `published`
- index on `voided`
- index on `leads_product_center_unit_id`
- index on `sales_product_center_unit_id`
- index on `activation_product_center_unit_id`
- optional composite index on `(published, voided, date_real)`

## Source Data Mapping Rules

The new upload/manual/source-data mapping should follow these rules:

- `leads` maps to `leads_product_center_unit_id`
- `sales` maps to `sales_product_center_unit_id`
- `activation` maps to `activation_product_center_unit_id`
- `payins` has no category assignment field

That means the upload template and manual entry form will need:

- one selector for leads category unit
- one selector for sales category unit
- one selector for activation category unit

And each selector must choose from:

- `Depot`
- `City`

through the shared `product_center_units` table

## Publishing Logic

Because `publishable_raw_data_v2` is a view, publishing becomes simpler.

Recommended rule:

- publishing updates `raw_data_v2.published`
- unpublishing sets it back to false
- voiding sets `voided = true`
- the view automatically reflects the correct public rows

This avoids maintaining a second physical publishable table.

## Migration / Cutover Direction

Since old raw data is archived and ignored for the new flow:

- do not mutate the old table into the new shape
- create the new tables and new view in parallel
- point new uploads, dashboards, and public leaderboard logic to the new structures
- archive old raw data separately

That is the cleanest cutover path.

## Final Recommendation

Recommended implementation set:

- `product_center_units`
- `raw_data_v2`
- `publishable_raw_data_v2` as a view on `raw_data_v2`

This is a solid foundation for the new system because it:

- matches the confirmed business rules
- removes depot-only assumptions
- supports different category assignments per metric
- keeps publishable data simple and derived

## Post-Implementation Cleanup Tracker

This section is for items that should be deleted, archived, renamed, or cleaned up after the new implementation is fully applied and verified.

Important rule:

- do not remove old structures too early
- only clean them after the new flow is confirmed working end to end

### Database Cleanup

Items to archive, replace, or stop using:

- old `raw_data` table
- old `publishable_raw_data` view
- old indexes tied to depot-only raw data identity
- old constraints tied to `leads_depot_id` and `sales_depot_id`
- old RPCs or triggers that assume the old raw-data shape

Decision already confirmed:

- old raw data will be ignored completely and archived

Cleanup actions after cutover:

- rename old `raw_data` to archive form if not yet archived
- rename old `publishable_raw_data` to archive form if needed
- remove writes from the app to old raw-data structures
- remove old RLS policies that only exist for old raw-data flows

### Backend / Service Cleanup

Old logic to remove after migration:

- any service still reading from `raw_data`
- any service still reading from old `publishable_raw_data`
- any code still expecting:
  - `leads_depot_id`
  - `sales_depot_id`
  - depot-only category logic
- old duplicate-ID generation logic based on depot fields
- any helper that assumes only 3 metrics

Expected areas to revisit:

- admin raw data service
- admin dashboard ranking service
- public leaderboard service
- any publish/unpublish helper still pointed to old tables

### Upload and Source Data Cleanup

Old upload behavior to remove:

- old XLSX header aliases for depot-only assignment fields
- old required-field validation tied to depot-only columns
- old manual-entry fields for:
  - `leads_depot`
  - `sales_depot`
- old save payloads that write only:
  - `leads`
  - `payins`
  - `sales`

Replace with new flow:

- `activation`
- `leads_product_center_unit_id`
- `sales_product_center_unit_id`
- `activation_product_center_unit_id`

### Formula and Scoring Cleanup

Old assumptions to remove:

- non-depot formulas limited to only 3 metrics
- preview calculators that only know:
  - `leads`
  - `payins`
  - `sales`
- hard-coded metric normalization that excludes `activation`
- any old tie-break logic that should be revised once activation-aware ranking is finalized

### Admin UI Cleanup

Old UI elements to remove or refactor after migration:

- upload labels that still say depot-only fields
- manual forms that still show leads depot / sales depot
- tables that still only show 3 metrics
- dashboard cards, detail panels, and exports that ignore activation
- update/edit pages that only edit 3 metrics

### Public UI Cleanup

Old public-facing assumptions to remove:

- leaderboard rows that only render 3 metrics
- podium cards that only render 3 metrics
- top summary metrics that only total 3 metrics
- old FAQ/formula text that describes outdated metric structure

### Naming Cleanup

Old names that should disappear from active code after cutover:

- `leads_depot_id`
- `sales_depot_id`
- any “depot-only” labels where the real concept is now product-center unit

Preferred naming going forward:

- `product_center_units`
- `leads_product_center_unit_id`
- `sales_product_center_unit_id`
- `activation_product_center_unit_id`

### Verification Before Cleanup

Do not remove old code until these are confirmed:

- new upload flow saves successfully into `raw_data_v2`
- publish/unpublish flow works with the new table/view
- admin dashboard reads the new structure correctly
- public leaderboard reads the new publishable view correctly
- activation is included correctly in scoring
- product-center assignment works for depot and city

### Final Cleanup Pass Checklist

When the new implementation is already stable, do a final cleanup pass for:

- dead service imports
- unused old helper functions
- unused old CSS selectors related to removed fields
- outdated comments mentioning old depot-only logic
- outdated docs and templates
- unused exports and old test data fixtures

### Working Note

As implementation progresses, add concrete file paths here for anything confirmed safe to remove.

Example format:

- `[pending cleanup] admin-app/src/services/rawData.service.js old depot-based helpers`
- `[pending cleanup] public-view/src/services/leaderboard.service.js old publishable_raw_data query`

Current confirmed cleanup targets from the audit:

- `[pending cleanup] admin-app/src/services/dashboardRankings.service.js old raw_data query and depot-based aggregation`
- `[pending cleanup] public-view/src/services/leaderboard.service.js old publishable_raw_data query and depot-based aggregation`
- `[pending cleanup] admin-app/src/pages/Upload.jsx old leads_depot_id / sales_depot_id manual-entry flow`
- `[pending cleanup] admin-app/src/pages/Dashboard.jsx old depot-based matching and detail rendering`
- `[pending cleanup] admin-app/src/pages/Publishing.jsx old depot-field display/export columns`
- `[pending cleanup] admin-app/src/pages/Updates.jsx old depot-field filtering and 3-metric editing assumptions`

### Current Implementation Checkpoint

Already migrated to the new structure:

- `admin-app/src/services/productCenterUnits.service.js`
- `admin-app/src/services/rawDataV2.service.js`
- `admin-app/src/pages/Upload.jsx`
- `admin-app/src/services/dashboardRankings.service.js`
- `admin-app/src/pages/Dashboard.jsx`
- `admin-app/src/pages/Publishing.jsx`
- `admin-app/src/pages/Updates.jsx`
- `public-view/src/services/leaderboard.service.js`
- `public-view/src/App.jsx`

Still pending follow-up / cleanup after the new implementation settles:

- `[pending follow-up] regenerate the upload XLSX template to match raw_data_v2 columns`
- `[pending cleanup] remove remaining user-facing "Depot" wording that is no longer meant to represent product centers`
- `[pending cleanup] review old raw_data audit-log dependencies before deleting raw_data_audit-based helpers`

Removed during cleanup:

- `[removed] admin-app/src/services/rawData.service.js legacy raw_data service with depot-based upload/history/publishing helpers`
- `[removed] admin-app/src/pages/Formulas.jsx old "Depots" section title replaced with "Product Centers"`

Deferred on purpose:

- `[deferred] admin-app/src/pages/Participants.jsx still manages actual Depot entities and should not be renamed blindly`
- `[deferred] admin-app/src/services/auditLog.service.js and admin-app/src/pages/AuditLog.jsx still depend on raw_data_audit and need a separate audit migration plan`

## Naming Recommendation

Recommended naming for the new implementation:

- Avoid:
  - `leads_depot_id`
  - `sales_depot_id`
- Prefer:
  - `leads_product_center_unit_id`
  - `sales_product_center_unit_id`

If shorter names are preferred:

- `leads_pc_unit_id`
- `sales_pc_unit_id`

But the longer names are clearer for maintainability.

## Recommended Sequence of Work

1. Finalize the product-center identity model.
2. Decide how `activation` is assigned to a product-center unit.
3. Finalize the raw-data schema.
4. Update upload template and manual entry structure.
5. Update aggregation and scoring logic.
6. Update dashboard/public visuals and exports.

## Direct Answer

You are not wrong.

Before proceeding with `Database and Source Data` changes in detail, we should first settle this exact question:

- what entity should replace the old depot-only identity in raw data?

My recommendation is:

- introduce a unified `product_center_units` table
- replace depot-only raw-data references with `*_product_center_unit_id`
- do not keep depot-specific names in the new model

Once that is agreed, the rest of the database and source-data changes become much clearer and safer.
