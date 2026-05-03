# HMDM CRM - Lifecycle Documentation Index

## Overview

This directory contains comprehensive lifecycle documentation for the HMDM CRM system — a production-grade call center CRM integrated with Issabel PBX and VICIdial.

## Lifecycle Documents

| Document | Description |
|---|---|
| [Incoming Call Lifecycle](./lifecycle-incoming-call.md) | Complete flow of inbound calls from PBX through disposition |
| [Outbound Call Lifecycle](./lifecycle-outbound-call.md) | Complete flow of outbound calls initiated by agents |
| [Call Popup Lifecycle](./lifecycle-call-popup.md) | Incoming call popup UI states, controls, and agent interactions |
| [Lead Lifecycle](./lifecycle-lead.md) | Lead creation, pipeline progression, and closure |
| [Follow-Up Lifecycle](./lifecycle-followup.md) | Follow-up scheduling, reminders, and completion |
| [Ticket Lifecycle](./lifecycle-ticket.md) | Support ticket creation, SLA management, and resolution |

## How Lifecycles Interconnect

```
                    ┌──────────────────┐
                    │   INBOUND CALL   │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  LEAD    │  │ FOLLOWUP │  │  TICKET  │
        │ (create) │  │ (create) │  │ (create) │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Pipeline │  │ Reminder │  │   SLA    │
        │ Progress │  │  & Due   │  │ Tracking │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │              │              │
             ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │Won/Lost  │  │Complete/ │  │Resolve/  │
        │          │  │  Skip    │  │  Close   │
        └──────────┘  └──────────┘  └──────────┘
                             ▲
                             │
                    ┌────────┴─────────┐
                    │   OUTBOUND CALL  │
                    └──────────────────┘
```

### Key Integration Points

1. **Call → Lead**: Disposition action `create_lead` auto-creates a lead from an inbound call
2. **Call → Follow-Up**: Disposition action `create_followup` schedules a callback
3. **Call → Ticket**: Disposition action `create_ticket` creates a support ticket
4. **Call → Lead Stage**: Disposition action `change_lead_stage` advances a lead in the pipeline
5. **Call → Escalation**: Disposition action `escalate` alerts supervisors
6. **Follow-Up → Call**: Agent can initiate an outbound call directly from a follow-up reminder
7. **Lead → Call**: Click-to-call from lead detail page links the call to the lead
8. **Ticket → Call**: Click-to-call from ticket detail page links the call to the ticket
9. **Campaign → Call**: Campaign dialer initiates outbound calls to campaign contacts
10. **Lead → Quotation**: Won leads can generate quotations and contracts

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ SoftPhone│  │Incoming  │  │Disposition│  │  Kanban/     │ │
│  │ (JsSIP)  │  │  Popup   │  │  Modal    │  │  Lists       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │              │              │               │         │
│  ┌────┴──────────────┴──────────────┴───────────────┴──────┐ │
│  │              WebSocket + REST API (Axios)                │ │
│  └────────────────────────┬────────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                        BACKEND (Django)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ AMI      │  │ Calls    │  │  Leads   │  │  Followups   │ │
│  │ Listener │  │ Services │  │ Services │  │  Tasks       │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
│       │              │              │               │         │
│  ┌────┴──────────────┴──────────────┴───────────────┴──────┐ │
│  │              Celery (Async Tasks + Beat)                  │ │
│  └────────────────────────┬────────────────────────────────┘ │
│  ┌────────────────────────┴────────────────────────────────┐ │
│  │              Django Channels (WebSocket)                  │ │
│  └────────────────────────┬────────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                     DATA LAYER                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────────┐ │
│  │PostgreSQL│  │  Redis   │  │  Asterisk / Issabel PBX    │ │
│  │(Primary) │  │(Cache/   │  │  (Telephony + AMI)         │ │
│  │          │  │ Broker)  │  │                            │ │
│  └──────────┘  └──────────┘  └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Zustand, React Query, JsSIP |
| Backend | Django 4.2, DRF, Celery, Django Channels, SimpleJWT |
| Database | PostgreSQL |
| Cache/Broker | Redis |
| Telephony | Asterisk/Issabel PBX, VICIdial |
| Real-time | WebSockets (Django Channels) |
| Async | Celery + Celery Beat |
