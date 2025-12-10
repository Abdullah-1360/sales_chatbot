# Service Status Flow Diagram

## Quick Status Handling Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              /api/serviceStatus REQUEST                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │ Get Service from │
              │      WHMCS       │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  Check Status    │
              └────────┬─────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌────────┐    ┌──────────┐   ┌──────────┐
   │ Active │    │Suspended │   │Terminated│
   └───┬────┘    └─────┬────┘   └─────┬────┘
       │               │              │
       │               │              │
       ▼               ▼              ▼
```

---

## Suspended Status Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUSPENDED SERVICE                             │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Check Suspension     │
              │      Reason          │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │ Invoice  │   │   TOS    │   │ Unknown  │
    │  Found   │   │Violation │   │  Reason  │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │
         ▼              ▼              ▼
    ┌──────────────────────────────────────────┐
    │         RESPONSE GENERATION              │
    └──────────────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ Billing │   │   Non-  │   │   Non-  │
    │  Issue  │   │ Billing │   │ Billing │
    └────┬────┘   └────┬────┘   └────┬────┘
         │              │              │
         ▼              ▼              ▼
    Show Invoice   Contact Support  Contact Support
    ❌ No Ticket   ✅ Ticket if     ✅ Ticket if
                      issue            issue
```

---

## Suspended - Billing Issue

```
┌─────────────────────────────────────────────────────────────────┐
│           SUSPENDED DUE TO BILLING ISSUE                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Find Unpaid Invoice  │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          │                             │
          ▼                             ▼
    ┌──────────┐                  ┌──────────┐
    │ Invoice  │                  │   No     │
    │  Found   │                  │ Invoice  │
    └────┬─────┘                  └────┬─────┘
         │                             │
         ▼                             ▼
    ┌──────────────────┐         ┌──────────────────┐
    │ Calculate Days   │         │ Generic Message  │
    │ Until Termination│         │ "Likely billing" │
    └────────┬─────────┘         └────────┬─────────┘
             │                             │
             ▼                             ▼
    ┌─────────────────────────────────────────────┐
    │              RESPONSE                        │
    ├─────────────────────────────────────────────┤
    │ status: "Suspended"                         │
    │ billingIssue: true                          │
    │ invoiceId: "131857"                         │
    │ amountDue: 5000.00                          │
    │ daysUntilTermination: 10                    │
    │ actionRequired: "payment"                   │
    │ message: "Pay invoice #131857..."           │
    └─────────────────────────────────────────────┘
                         │
                         ▼
                  ❌ NO TICKET CREATED
                  (User needs to pay)
```

---

## Suspended - Non-Billing Issue

```
┌─────────────────────────────────────────────────────────────────┐
│        SUSPENDED DUE TO NON-BILLING ISSUE                        │
│        (TOS Violation, Abuse, Manual Suspension)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Check Suspension     │
              │      Reason          │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ No Unpaid Invoice    │
              │ No Overdue Date      │
              └──────────┬───────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────────┐
    │              RESPONSE                        │
    ├─────────────────────────────────────────────┤
    │ status: "Suspended"                         │
    │ billingIssue: false                         │
    │ reason: "TOS Violation"                     │
    │ actionRequired: "contact_support"           │
    │ message: "Suspended by team: TOS..."        │
    └─────────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Issue Provided?      │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          │                             │
          ▼                             ▼
       ┌─────┐                      ┌─────┐
       │ YES │                      │ NO  │
       └──┬──┘                      └──┬──┘
          │                            │
          ▼                            ▼
    ✅ CREATE TECH              ❌ NO TICKET
    SUPPORT TICKET              (Just return status)
    (High Priority)
```

---

## Terminated Status Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  TERMINATED SERVICE                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Check Domain &       │
              │ Hosting Status       │
              └──────────┬───────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │   Both   │   │  Domain  │   │ Hosting  │
    │Terminated│   │   Only   │   │   Only   │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ status: │   │ status: │   │ status: │
    │Terminated│  │ Partial │   │ Partial │
    └────┬────┘   └────┬────┘   └────┬────┘
         │              │              │
         ▼              ▼              ▼
    ┌─────────────────────────────────────────┐
    │ billingIssue: false                     │
    │ actionRequired: null or contact_support │
    │ message: "Service terminated..."        │
    └─────────────────────────────────────────┘
                         │
                         ▼
                  ❌ NO TICKET CREATED
                  (Service permanently ended)
```

---

## Status Priority (Multiple Products)

```
When domain has multiple hosting products:

┌─────────────────────────────────────────────────────────────────┐
│              MULTIPLE PRODUCTS DETECTED                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Collect All Products │
              │   with Statuses      │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Priority Selection  │
              └──────────┬───────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌────────┐      ┌──────────┐     ┌──────────┐
   │ Active │  >   │Suspended │  >  │ Pending  │
   │Priority│      │ Priority │     │ Priority │
   └────┬───┘      └─────┬────┘     └─────┬────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌────────┐      ┌──────────┐     ┌──────────┐
   │Expired │  >   │Terminated│  >  │Cancelled │
   │Priority│      │ Priority │     │ Priority │
   └────┬───┘      └─────┬────┘     └─────┬────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Use Primary Product  │
              │   for Main Status    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Include Status Counts│
              │ & Product Names      │
              └──────────────────────┘

Example Response:
{
  "hostingStatus": "Active",
  "statusCounts": {
    "Active": 2,
    "Suspended": 1,
    "Terminated": 1
  },
  "totalProducts": 4,
  "message": "Your active hosting: Product A, Product B. 
              You also have 2 inactive products."
}
```

---

## Ticket Creation Decision Tree

```
                    ┌─────────────────┐
                    │  Service Status │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌────────┐         ┌──────────┐         ┌──────────┐
   │ Active │         │Suspended │         │Terminated│
   └───┬────┘         └─────┬────┘         └─────┬────┘
       │                    │                     │
       │                    │                     │
       ▼                    ▼                     ▼
   Issue?              billingIssue?          ❌ NO TICKET
       │                    │
   ┌───┴───┐         ┌──────┴──────┐
   │       │         │             │
   ▼       ▼         ▼             ▼
  YES     NO       true          false
   │       │         │             │
   ▼       ▼         ▼             ▼
  ✅      ❌       ❌ NO        Issue?
TICKET  NO TICKET TICKET          │
                 (Show         ┌───┴───┐
                 Invoice)      │       │
                               ▼       ▼
                              YES     NO
                               │       │
                               ▼       ▼
                              ✅      ❌
                            TICKET  NO TICKET
```

---

## Summary Table

| Status | Billing Issue? | Issue Provided? | Ticket Created? | Action Required |
|--------|---------------|-----------------|-----------------|-----------------|
| **Active** | N/A | No | ❌ No | null |
| **Active** | N/A | Yes | ✅ Yes (Tech) | null |
| **Suspended** | Yes | No | ❌ No | payment |
| **Suspended** | Yes | Yes | ❌ No | payment |
| **Suspended** | No | No | ❌ No | contact_support |
| **Suspended** | No | Yes | ✅ Yes (Tech) | contact_support |
| **Terminated** | N/A | No | ❌ No | null |
| **Terminated** | N/A | Yes | ❌ No | null |
| **Pending** | No | No | ❌ No | null |
| **Pending** | No | Yes | ✅ Yes (Tech) | null |

---

## Key Takeaways

1. ✅ **Suspended** is fully handled with billing vs non-billing detection
2. ✅ **Terminated** is fully handled with partial status support
3. ✅ **Multiple products** are handled with priority selection
4. ✅ **Ticket creation** is smart - only when appropriate
5. ✅ **Termination warnings** calculated for suspended services
6. ✅ **Invoice lookup** automatic for billing issues
7. ✅ **Status counts** shown for multiple products
8. ✅ **Product names** included in messages
