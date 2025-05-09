//// Example model schema from the Drizzle docs
//// https://orm.drizzle.team/docs/sql-schema-declaration
//
//import { sql } from "drizzle-orm";
//import { index, pgTableCreator } from "drizzle-orm/pg-core";
//
///**
// * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
// * database instance for multiple projects.
// *
// * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
// */
//export const createTable = pgTableCreator((name) => `pz-poker_${name}`);
//
//export const posts = createTable(
//  "post",
//  (d) => ({
//    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
//    name: d.varchar({ length: 256 }),
//    createdAt: d
//      .timestamp({ withTimezone: true })
//      .default(sql`CURRENT_TIMESTAMP`)
//      .notNull(),
//    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
//  }),
//  (t) => [index("name_idx").on(t.name)],
//);

//export const createTable = pgTableCreator((name) => `pz-poker_${name}`)

import {
  pgTable,
  varchar,
  text,
  timestamp,
  serial,
  integer,
  boolean,
  primaryKey, // Keep this import if used elsewhere, but we'll use unique for the constraint
  index,
  unique, // <-- Add this import
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Poker Sessions (Rooms) - (Assuming this is correct as per your snippet)
export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 12 }).primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    currentStoryId: integer('current_story_id'),
    votesRevealed: boolean('votes_revealed').default(false).notNull(),
  },
  (table) => {
    return {
      nameIdx: index('name_idx').on(table.name),
    };
  }
);

// Corrected Participants in a Session
export const participants = pgTable(
  'participants',
  {
    id: serial('id').primaryKey(), // This is the primary key
    sessionId: varchar('session_id', { length: 12 })
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 256 }).notNull(),
    name: varchar('name', { length: 256 }).notNull(),
    isHost: boolean('is_host').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      sessionIdx: index('participant_session_idx').on(table.sessionId),
      userIdx: index('participant_user_idx').on(table.userId),
      // Changed from primaryKey to unique constraint
      uniqueUserInSession: unique('unique_user_in_session_uq') // Drizzle typically names unique constraints with _uq
        .on(table.sessionId, table.userId),
    };
  }
);

// Stories/Tasks to be estimated - (Assuming this is correct)
export const stories = pgTable(
  'stories',
  {
    id: serial('id').primaryKey(),
    sessionId: varchar('session_id', { length: 12 })
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 256 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      sessionIdx: index('story_session_idx').on(table.sessionId),
    };
  }
);


// Corrected Votes
export const votes = pgTable(
  'votes',
  {
    id: serial('id').primaryKey(), // This is the primary key
    storyId: integer('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    participantId: integer('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    voteValue: varchar('vote_value', { length: 50 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      storyIdx: index('vote_story_idx').on(table.storyId),
      participantIdx: index('vote_participant_idx').on(table.participantId),
      // Changed from primaryKey to unique constraint
      uniqueVote: unique('unique_vote_uq') // Drizzle typically names unique constraints with _uq
        .on(table.storyId, table.participantId),
    };
  }
);

// --- RELATIONS --- (Assuming these are correct as per your snippet)
export const sessionsRelations = relations(sessions, ({ many, one }) => ({
  participants: many(participants),
  stories: many(stories),
  currentStory: one(stories, {
    fields: [sessions.currentStoryId],
    references: [stories.id],
  }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  session: one(sessions, {
    fields: [participants.sessionId],
    references: [sessions.id],
  }),
  votes: many(votes),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  session: one(sessions, {
    fields: [stories.sessionId],
    references: [sessions.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  story: one(stories, {
    fields: [votes.storyId],
    references: [stories.id],
  }),
  participant: one(participants, {
    fields: [votes.participantId],
    references: [participants.id],
  }),
}));