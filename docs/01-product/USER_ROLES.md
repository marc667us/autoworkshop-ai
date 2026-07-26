# User roles

Roles are assigned per organization membership. A user may hold different roles in different
organizations; every request resolves exactly one active tenant + role context.

## Customer side
Vehicle Owner · Driver · Fleet Administrator · Fleet Approver

## Workshop side
Workshop Owner · Workshop Administrator · Service Adviser · Lead Technician · Mechanic · Auto Electrician ·
Electronics Technician · Body Technician · Welder · Spray Painter · Upholsterer · Vulcanizer ·
Storekeeper · Procurement Officer · Quality Inspector

## Commercial partners
Supplier Owner · Supplier Staff · Insurance Assessor · Claims Approver · Towing Dispatcher ·
Towing Driver · Training Instructor

## Platform
Platform Support Agent · Security Analyst · Platform Administrator · MCP Administrator

## Rules

- **Sensitive role changes require authorised human approval.** The AI can never create its own privileges
  (`0.txt` MCP Server 1).
- Role assignment is audited (`1.txt` §55).
- Technician assignment is validated against workload, permission **and competency** (`0.txt` MCP Server 4).
- A user's roles never cross tenant boundaries.
