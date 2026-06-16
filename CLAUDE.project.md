# Temple Management System — AI Project Context

## Project Goal
Build a Thai-first temple management system (ระบบจัดการวัด) for real-world temple operations.

## Current Repository Status
This repository now contains the MVP foundation for the Thai-first temple management system, including database schema/migrations, API modules, web feature views, design-backed shell/login UI, tests, and build configuration. Inspect actual files before relying on older planning docs.

## Product Scope
The system should eventually cover:
- Temple profile / ข้อมูลวัด
- Monks, novices, and staff / พระ สามเณร บุคลากร
- Donors and lay supporters / ญาติโยม ผู้บริจาค
- Donations, receipts, and anumodana certificates / รับบริจาค ใบอนุโมทนา ใบเสร็จ
- Accounting / รายรับรายจ่าย บัญชี หลักฐาน
- Events and ceremonies / กิจกรรม งานบุญ งานพิธี จองศาลา นิมนต์พระ
- Inventory and assets / คลังของบริจาค พัสดุ สังฆทาน อุปกรณ์วัด
- Reports and exports / รายงาน PDF Excel Dashboard
- Users, roles, permissions / ผู้ใช้ สิทธิ์
- Audit logs, backup, import/export / ประวัติการแก้ไข สำรองข้อมูล

## Product Rules
- Thai language first; use terminology natural for temple staff.
- Financial records must never be hard-deleted; use void/cancel with reason.
- Donations, receipts, expenses, and permission changes must create audit logs.
- Every financial document needs a unique traceable document number.
- Canonical product access has 3 top-level groups: `platform_owner` (platform plane via `/platform/auth`), `temple_owner` (tenant `admin`), and `temple_user` (tenant `finance`/`staff` capability subroles). Do not reintroduce `auditor`/`viewer` into product runtime unless DB schema, seed, API, and tests are updated first.
- Design for non-technical temple staff: clear forms, tables, empty states, and guided workflows.

## Suggested Development Workflow
1. Start with a product specification and data model.
2. Build an MVP around dashboard, donor CRM, donation intake, receipt generation, and accounting ledger.
3. Add role-based access control and audit logging before production use.
4. Add event/ceremony booking and inventory after financial workflows are safe.
5. Run tests/build and document verification for every feature.

## AI Agent Rules
- Inspect actual files before claiming a feature exists.
- If a feature is not backed by code/design/spec, mark it as missing or unclear.
- For financial/sensitive data, include permission checks, validation, audit logs, and tests.
- Before implementing, write acceptance criteria and verification steps.
