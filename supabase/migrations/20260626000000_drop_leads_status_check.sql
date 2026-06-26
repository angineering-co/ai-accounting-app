-- Drop the CHECK constraint on leads.status so new pipeline statuses (e.g.
-- 'lost') can be added in the app layer without a follow-up migration each
-- time. Status values are validated at the write site via isLeadStatus().
alter table leads drop constraint if exists leads_status_check;
