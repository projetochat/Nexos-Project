# GCC-01 - Initial System Corrections

Status: IMPLEMENTATION COMPLETE - READY FOR MANUAL HOMOLOGATION

Date: 2026-08-18

## Scope

This sprint starts the General Correction Cycle after the Messaging Core stabilization. The goal was to correct operational defects already observed in manual use, without adding unrelated new features.

## Corrections Delivered

1. Contacts search
   - Fixed contact search behavior when filtering by name.
   - Root cause: the phone-normalized branch could match every row when the query had no digits.
   - Result: text searches now filter by contact name, phone, email, and customer name without being neutralized by an empty normalized-phone search.

2. Conversation history
   - Fixed duplicate conversation creation from History/New conversation.
   - Root cause: backend only reused an existing open conversation when a connection id was present.
   - Result: creating a conversation for a contact now reuses an existing non-closed conversation for that contact, even when the request comes without a connection id.

3. Access profiles
   - Expanded and reorganized the permissions screen using the existing backend permission catalog.
   - Groups added: Administration, CRM/leads, Attendance/messages, Catalogs/channels, Automations/tickets/campaigns.
   - No new permission keys were invented.

4. Quick replies
   - Quick reply title, shortcut, and content now accept 1 character.

5. Campaigns
   - After creating a campaign, the screen clears filters, selects the created campaign, and invalidates all campaign queries.
   - This prevents a valid draft from being hidden by stale filters or stale cache.

6. Instances
   - The QR modal now closes when the connection becomes connected.
   - Connected instances display a confirmation state instead of keeping the QR action active.

7. Settings
   - Removed the mock "Mensagens automaticas" entry from Settings navigation.
   - Legacy route redirects to Automations.
   - Removed the mock "Seguranca / Sessoes ativas" entry from Settings navigation.
   - Legacy route redirects to General Settings.

8. My Profile
   - Replaced mocked profile data with the authenticated session user.
   - The screen now shows the same user identity used by the navbar/session layer.

## Validation

Automated validation executed:

```text
bun run typecheck
PASS

bun run backend:build
PASS

bun run build
PASS
```

Manual validation still required:

1. Search contacts by name, phone, email, and customer.
2. Open History and start a new conversation for a contact that already has an open chat.
3. Save a role/profile with newly exposed permission groups.
4. Create quick replies with 1-character shortcut and 1-character content.
5. Create a campaign while filters are active and confirm it appears immediately.
6. Connect an Evolution instance and confirm QR disappears after connection.
7. Confirm Settings no longer exposes mocked automatic messages or active sessions.
8. Open My Profile with different logged users and compare against navbar identity.

## Final Gate

GCC-01 IMPLEMENTATION COMPLETE

Not production-approved yet. It requires the manual validation matrix above in the deployed/local homologation environment.
