# Sraya Fleet Management — Phase 1 Specification

Internal fleet management software for a palm-oil factory to track pickup trucks collecting Fresh Fruit Bunches (TBS) from pickup sites and returning to the factory.

---

## 1. Architecture & Stack

- **Backend:** Go (`gofiber/fiber/v2`) + GORM + PostgreSQL (`postgres` driver)
- **Frontend:** React + Tailwind CSS + Vite (Nginx for production container)
- **Ops:** Docker Compose with 3 services:
  1. `db` (PostgreSQL 16)
  2. `api` (Go Fiber backend)
  3. `web` (React SPA served by Nginx)

---

## 2. Authentication & Authorization

- **Auth Mode:** Internal `username + password` with JWT stored in an `httpOnly` cookie.
- **Roles:**
  1. `Administrator`: full access to user management, master data, and trip operations.
  2. `Fleet Operator`: create, return, edit, and view trips; no user management.
- **User Management (Admin only):**
  - Create user (username, password, role).
  - Password reset directly by admin (no email flow).
  - Deactivate/activate user (deactivated users cannot log in; trip history preserved).

---

## 3. Master Data

### 3.1 Trucks
- **Fields:**
  - `plate_number` (string, unique, required)
  - `display_name` (string, required)
  - `capacity_kg` (integer, required, > 0)
  - `is_active` (boolean, default true)
  - `usual_driver_id` (foreign key to Driver, optional/nullable for inactive trucks; required for active trucks)
- **Business Rules:**
  - Active trucks must have exactly 1 usual driver.
  - Inactive trucks can have 0 driver.
  - Driver can be usual driver for at most 1 truck.
  - Reassigning usual driver: previous truck receives new usual driver OR must be explicitly set inactive in the same operation.
  - Deletion allowed only if never used in a trip; otherwise deactivate.
  - Cannot deactivate while assigned to an active (dispatched) trip.

### 3.2 Drivers
- **Fields:**
  - `full_name` (string, required)
  - `is_active` (boolean, default true)
- **Business Rules:**
  - Deletion allowed only if never used in a trip; otherwise deactivate.
  - Cannot deactivate while assigned to an active trip.

### 3.3 Pickup Sites
- **Fields:**
  - `site_name` (string, required)
  - `distance_km` (integer or float, required, strictly > 0)
  - `is_active` (boolean, default true)
- **Business Rules:**
  - Fixed one-way distance from factory (no trip-level override).
  - Deletion allowed only if never used in a trip; otherwise deactivate.
  - Cannot deactivate while referenced by an active trip.

---

## 4. Operational Workflows (Pickup Trips)

### 4.1 Trip Record Structure
- `id` (UUID / Primary Key)
- `truck_id` (FK to Truck)
- `driver_id` (FK to Driver, recorded at dispatch)
- `pickup_site_id` (FK to PickupSite)
- `capacity_snapshot_kg` (integer, snapshot of truck capacity at dispatch)
- `dispatch_time` (timestamp, defaults to now, editable)
- `return_time` (timestamp, nullable until returned, defaults to now on return, editable)
- `trip_money_idr` (integer IDR, required, >= 0)
- `notes` (text, optional)
- `pickup_gross_kg` (integer, nullable until returned, >= pickup_tare_kg)
- `pickup_tare_kg` (integer, nullable until returned)
- `factory_gross_kg` (integer, nullable until returned, >= factory_tare_kg)
- `factory_tare_kg` (integer, nullable until returned)
- `status` (`DISPATCHED` | `RETURNED`)
- `created_by` (FK to User)
- `updated_by` (FK to User)
- `created_at`, `updated_at` (timestamps)

### 4.2 Dispatch Flow (Trip Creation)
1. Manager selects an active truck.
2. System pre-fills `driver_id` with truck's usual driver (if active). Manager can replace with any active driver.
3. Manager selects active pickup site.
4. Input `trip_money_idr` (default 0 or required >= 0) and optional `notes`.
5. System snapshots `truck.capacity_kg` into `capacity_snapshot_kg`.
6. Enforce DB constraint: truck and driver cannot have another active (`DISPATCHED`) trip.
7. Save trip with status `DISPATCHED`.

### 4.3 Return Flow
1. Manager opens an active trip (from dashboard or list) and completes return form.
2. Enter all 4 weights manually (all required, whole kg):
   - `pickup_gross_kg`, `pickup_tare_kg`
   - `factory_gross_kg`, `factory_tare_kg`
3. Validation: `pickup_gross_kg >= pickup_tare_kg` and `factory_gross_kg >= factory_tare_kg`.
4. Return timestamp defaults to current time (editable).
5. Set status = `RETURNED`.

### 4.4 On-Read Calculations
- `pickup_net_kg` = `pickup_gross_kg - pickup_tare_kg`
- `factory_net_kg` = `factory_gross_kg - factory_tare_kg` (Official Received TBS)
- `weight_difference_kg` = `pickup_net_kg - factory_net_kg`
- `load_status`:
  - `Overweight` if `factory_net_kg > capacity_snapshot_kg`
  - `Underweight` if `factory_net_kg < capacity_snapshot_kg`
  - `At capacity` if `factory_net_kg == capacity_snapshot_kg`

---

## 5. Reporting & Dashboard

### 5.1 Dashboard
- **KPI Summary:**
  - Count of currently active (dispatched) trips.
  - Count of trucks currently out.
  - Today's official factory-received TBS total (kg).
- **Active Trips List:**
  - Table of all active trips (truck, driver, site, dispatch time, trip money, elapsed time).
  - Direct "Record Return" action on each row.
- **Charts (Date range filter, default = Today based on return date):**
  1. Daily factory-receipt TBS total.
  2. Completed trips grouped by pickup site.

### 5.2 Completed Trips History
- Filterable by: return-date range (start/end), truck, driver, pickup site.
- Text search by plate number, driver name, or site name.
- Sortable columns (default: return time descending).
- Paginated results.
- **Export:** Export currently filtered results to CSV.

---

## 6. Notifications & Alerts

- **v1 Policy:** No automated notifications, emails, or background alerts. Elapsed trip duration is visible on the dashboard for manual monitoring.

---

## 7. Seeding & Setup

- **Seeder CLI / Entrypoint:**
  - Auto-seeds default admin account if no users exist (`admin` / customizable initial password via ENV).
  - Seed command for local development master data (sample drivers, trucks, pickup sites).

---

## 8. Invariants & Rules

- Trips are **never deletable** (edits allowed).
- Truck & Driver concurrent active trip limit = 1 (DB constraint).
- All weights are whole-number kilograms (kg).
- All trip money values are whole Indonesian Rupiah (IDR).
- All timestamps are in **Asia/Jakarta** (WIB, UTC+7) for display and daily aggregation.

---

## 9. Future Scope (explicitly NOT in v1)

- CPO delivery trucks (Phase 2 scope).
- Driver pay calculation (based on distance + weight difference).
- Maintenance module (based on trip distance + odometer).
- External weighbridge API integration.
- Deviation thresholds for underweight.
- Dashboards with advanced KPIs and charts.
- Weight difference chart.
- Automated alerts and notifications.
- Email/SSO login and self-service password reset.
- Per-permission configurable RBAC.
- Void/reversal workflow for trips.
- Return weight data from external API.

