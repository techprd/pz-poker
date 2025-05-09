import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { sessions, participants, stories, votes } from '~/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid'; // For generating short session IDs

const POKER_VALUES = ["0", "1/2", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕️"];


// Helper function to get current active story for a session
async function getCurrentStory(sessionId: string) {
  const currentStories = await db.select().from(stories)
    .where(and(eq(stories.sessionId, sessionId), eq(stories.isActive, true)))
    .limit(1);
  return currentStories[0] ?? null;
}

export const pokerRouter = createTRPCRouter({
  createSession: publicProcedure
    .input(z.object({ sessionName: z.string().min(1), hostName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const sessionId = nanoid(8); // Generate an 8-character ID
      const [session] = await db.insert(sessions).values({
        id: sessionId,
        name: input.sessionName,
      }).returning();

      if (!session) throw new Error("Could not create session");

      const [participant] = await db.insert(participants).values({
        sessionId: session.id,
        userId: input.hostName, // In a real app, this would be a user ID from auth
        name: input.hostName,
        isHost: true,
      }).returning();

      if (!participant) throw new Error("Could not create host participant");

      return { sessionId: session.id, hostId: participant.id, hostName: participant.name };
    }),

  joinSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1), userName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const existingSession = await db.query.sessions.findFirst({
        where: eq(sessions.id, input.sessionId),
      });
      if (!existingSession) {
        throw new Error('Session not found');
      }

      // Check if user already exists in this session by name (simple check)
      let participant = await db.query.participants.findFirst({
        where: and(eq(participants.sessionId, input.sessionId), eq(participants.userId, input.userName))
      });

      if (!participant) {
        [participant] = await db.insert(participants).values({
          sessionId: input.sessionId,
          userId: input.userName, // Using name as userId for simplicity
          name: input.userName,
          isHost: false, // New joiners are not hosts
        }).returning();
      }

      if (!participant) throw new Error("Could not join session");

      return { sessionId: existingSession.id, participantId: participant.id, participantName: participant.name };
    }),

  getSessionDetails: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const sessionDetails = await db.query.sessions.findFirst({
        where: eq(sessions.id, input.sessionId),
        with: {
          participants: true,
          stories: {
            orderBy: (stories, { desc }) => [desc(stories.createdAt)], // Show newest first
          },
        },
      });

      if (!sessionDetails) {
        throw new Error('Session not found');
      }

      const activeStory = await getCurrentStory(input.sessionId);
      let storyVotes = null;
      if (activeStory) {
          storyVotes = await db.query.votes.findMany({
              where: eq(votes.storyId, activeStory.id),
              with: {
                  participant: {
                      columns: { name: true, id: true }
                  }
              }
          });
      }


      return {
        ...sessionDetails,
        currentStory: activeStory,
        votes: storyVotes,
        pokerValues: POKER_VALUES
      };
    }),

  addStory: publicProcedure
    .input(z.object({ sessionId: z.string(), title: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      // Ensure session exists
      const sessionExists = await db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
      if (!sessionExists) throw new Error("Session not found");

      // Deactivate other active stories for this session
      await db.update(stories)
        .set({ isActive: false })
        .where(eq(stories.sessionId, input.sessionId));

      const [newStory] = await db.insert(stories).values({
        sessionId: input.sessionId,
        title: input.title,
        description: input.description,
        isActive: true, // New story is active
      }).returning();

      // Update session's currentStoryId and reset votesRevealed
      await db.update(sessions)
        .set({ currentStoryId: newStory!.id, votesRevealed: false })
        .where(eq(sessions.id, input.sessionId));

      // Clear votes from previous story (optional, good practice)
      // This is more complex if you need to preserve vote history.
      // For simplicity, we assume votes are only for the active story.

      return newStory;
    }),

  castVote: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      participantId: z.number(), // Assuming participant.id is a number (serial)
      voteValue: z.string().refine(val => POKER_VALUES.includes(val), {
        message: "Invalid vote value",
      })
    }))
    .mutation(async ({ input }) => {
      const currentStory = await getCurrentStory(input.sessionId);
      if (!currentStory) {
        throw new Error('No active story to vote on.');
      }

      const participantExists = await db.query.participants.findFirst({
        where: and(eq(participants.id, input.participantId), eq(participants.sessionId, input.sessionId))
      });
      if (!participantExists) throw new Error("Participant not found in this session");

      // Upsert vote
      const [vote] = await db.insert(votes)
        .values({
          storyId: currentStory.id,
          participantId: input.participantId,
          voteValue: input.voteValue,
        })
        .onConflictDoUpdate({
          target: [votes.storyId, votes.participantId], // Use the unique constraint name if defined, or columns
          set: { voteValue: input.voteValue, createdAt: new Date() },
        })
        .returning();
      return vote;
    }),

  revealVotes: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const currentStory = await getCurrentStory(input.sessionId);
      if (!currentStory) {
        throw new Error('No active story to reveal votes for.');
      }
      await db.update(sessions)
        .set({ votesRevealed: true })
        .where(eq(sessions.id, input.sessionId));
      return { success: true };
    }),

  clearVotesAndNextStory: publicProcedure // Or resetRound
    .input(z.object({ sessionId: z.string(), nextStoryId: z.number().optional() }))
    .mutation(async ({ input }) => {
      // Clear votesRevealed status
      await db.update(sessions)
        .set({ votesRevealed: false, currentStoryId: input.nextStoryId ?? null })
        .where(eq(sessions.id, input.sessionId));

      if (input.nextStoryId) {
        // Deactivate all stories first
        await db.update(stories)
          .set({ isActive: false })
          .where(eq(stories.sessionId, input.sessionId));
        // Activate the new story
        await db.update(stories)
          .set({ isActive: true })
          .where(and(eq(stories.id, input.nextStoryId), eq(stories.sessionId, input.sessionId)));
      } else {
         // If no next story, deactivate current one
        await db.update(stories)
          .set({ isActive: false })
          .where(eq(stories.sessionId, input.sessionId));
      }
      // Note: Actual vote records are kept for history. New round means new story or re-vote on same.

      return { success: true };
    }),
});

// Add to src/server/api/root.ts:
// import { pokerRouter } from '~/server/api/routers/poker';
// export const appRouter = createTRPCRouter({
//   poker: pokerRouter,
//   // ... other routers
// });
// export type AppRouter = typeof appRouter;