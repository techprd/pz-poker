import {
  pgTable,
  varchar,
  text,
  timestamp,
  serial,
  integer,
  boolean,
  primaryKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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

export const participants = pgTable(
  'participants',
  {
    id: serial('id').primaryKey(),
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
      uniqueUserInSession: unique('unique_user_in_session_uq').on(table.sessionId, table.userId),
    };
  }
);

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

export const votes = pgTable(
  'votes',
  {
    id: serial('id').primaryKey(),
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
      uniqueVote: unique('unique_vote_uq').on(table.storyId, table.participantId),
    };
  }
);

export const bets = pgTable(
  'bets',
  {
    id: serial('id').primaryKey(),
    storyId: integer('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    participantId: integer('participant_id')
      .notNull()
      .references(() => participants.id, { onDelete: 'cascade' }),
    betValue: varchar('bet_value', { length: 50 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => {
    return {
      uniqueBet: unique('unique_bet_uq').on(table.storyId, table.participantId),
    };
  }
);

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
  bets: many(bets),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  session: one(sessions, {
    fields: [stories.sessionId],
    references: [sessions.id],
  }),
  votes: many(votes),
  bets: many(bets),
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

export const betsRelations = relations(bets, ({ one }) => ({
  story: one(stories, {
    fields: [bets.storyId],
    references: [stories.id],
  }),
  participant: one(participants, {
    fields: [bets.participantId],
    references: [participants.id],
  }),
}));
