import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { db } from '~/server/db';
import { sessions, participants, stories, votes, bets } from '~/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid'; // For generating short session IDs

// Definition of poker values, used for validating votes and potentially bets
const POKER_VALUES = ["0", "1/2", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕️"];


// Helper function to get current active story for a session
async function getCurrentStory(sessionId: string) {
  // Fetches the story marked as active for the given session
  const currentStories = await db.select().from(stories)
    .where(and(eq(stories.sessionId, sessionId), eq(stories.isActive, true)))
    .limit(1);
  return currentStories[0] ?? null; // Returns the story object or null if not found
}

export const pokerRouter = createTRPCRouter({
  createSession: publicProcedure
    .input(z.object({ sessionName: z.string().min(1), hostName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const sessionId = nanoid(8); // Generate an 8-character unique ID for the session
      // Insert the new session into the database
      const [session] = await db.insert(sessions).values({
        id: sessionId,
        name: input.sessionName,
      }).returning(); // Return the inserted session object

      if (!session) throw new Error("Could not create session");

      // Insert the host as the first participant of the session
      const [participant] = await db.insert(participants).values({
        sessionId: session.id,
        userId: input.hostName, // Using name as userId for simplicity; in a real app, this would be an auth user ID
        name: input.hostName,
        isHost: true, // Mark this participant as the host
      }).returning(); // Return the inserted participant object

      if (!participant) throw new Error("Could not create host participant");

      // Return session and host details to the client
      return { sessionId: session.id, hostId: participant.id, hostName: participant.name };
    }),
    
  createBet: publicProcedure
    .input(z.object({
      storyId: z.number(), // ID of the story the bet is for
      participantId: z.number(), // ID of the participant placing the bet
      // Bet value must be a string and one of the predefined POKER_VALUES
      betValue: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Retrieve the story to ensure it exists and is active
      const story = await db.query.stories.findFirst({
        where: eq(stories.id, input.storyId),
      });
      if (!story) {
        throw new Error('Story not found for this bet.');
      }
      // Optionally, check if the story is active if bets are only for active stories
      if (!story.isActive) {
        throw new Error('Bets can only be placed on active stories.');
      }

      // Verify that the participant exists and belongs to the correct session (via the story's session)
      const participantExists = await db.query.participants.findFirst({
        where: and(eq(participants.id, input.participantId), eq(participants.sessionId, story.sessionId))
      });
      if (!participantExists) {
        throw new Error("Participant not found in this session.");
      }

      // Upsert the bet: insert if new, update if exists for the same story and participant
      const [bet] = await db.insert(bets)
        .values({
          storyId: input.storyId,
          participantId: input.participantId,
          betValue: input.betValue, // Store the string representation of the bet
        })
        .onConflictDoUpdate({
          // Uses the 'unique_bet_uq' unique constraint on (storyId, participantId)
          target: [bets.storyId, bets.participantId], 
          // Fields to update if a conflict occurs
          set: { betValue: input.betValue, createdAt: new Date() }, 
        })
        .returning(); // Return the inserted or updated bet object

      if (!bet) throw new Error("Could not place or update bet.");
      
      return bet; // Return the bet details
    }),

  joinSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1), userName: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Check if the session exists
      const existingSession = await db.query.sessions.findFirst({
        where: eq(sessions.id, input.sessionId),
      });
      if (!existingSession) {
        throw new Error('Session not found');
      }

      // Check if a participant with the same name (acting as userId) already exists in this session
      let participant = await db.query.participants.findFirst({
        where: and(eq(participants.sessionId, input.sessionId), eq(participants.userId, input.userName))
      });

      // If participant doesn't exist, create a new one
      if (!participant) {
        [participant] = await db.insert(participants).values({
          sessionId: input.sessionId,
          userId: input.userName, // Using name as userId for simplicity
          name: input.userName,
          isHost: false, // New joiners are not hosts by default
        }).returning();
      }

      if (!participant) throw new Error("Could not join session or create participant");

      // Return session and participant details
      return { sessionId: existingSession.id, participantId: participant.id, participantName: participant.name, isHost: participant.isHost };
    }),

  getSessionDetails: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      // Fetch main session details along with related participants and stories
      const sessionDetails = await db.query.sessions.findFirst({
        where: eq(sessions.id, input.sessionId),
        with: {
          participants: true, // Include all participants in the session
          stories: { // Include all stories, ordered by creation date (newest first)
            orderBy: (storiesTable, { desc }) => [desc(storiesTable.createdAt)],
          },
        },
      });

      if (!sessionDetails) {
        throw new Error('Session not found');
      }

      // Get the currently active story for this session
      const activeStory = await getCurrentStory(input.sessionId);
      
      let storyVotes = null;
      let storyBetsData = null; // Variable to hold bets for the active story

      if (activeStory) {
          // If there's an active story, fetch its votes
          storyVotes = await db.query.votes.findMany({
              where: eq(votes.storyId, activeStory.id),
              with: { // Include participant details with each vote
                  participant: {
                      columns: { name: true, id: true }
                  }
              }
          });
          // Fetch bets for the active story
          storyBetsData = await db.query.bets.findMany({
              where: eq(bets.storyId, activeStory.id),
              with: { // Include participant details with each bet
                  participant: {
                      columns: { name: true, id: true }
                  }
              }
          });
      }

      // Return all session details, including the active story, its votes, its bets, and poker values
      return {
        ...sessionDetails,
        currentStory: activeStory,
        votes: storyVotes,
        bets: storyBetsData, // Include fetched bets in the response
        pokerValues: POKER_VALUES // Standard poker values for UI
      };
    }),

  addStory: publicProcedure
    .input(z.object({ sessionId: z.string(), title: z.string().min(1), description: z.string().optional() }))
    .mutation(async ({ input }) => {
      const sessionExists = await db.query.sessions.findFirst({ where: eq(sessions.id, input.sessionId) });
      if (!sessionExists) throw new Error("Session not found");

      // Deactivate any other stories currently active in this session
      await db.update(stories)
        .set({ isActive: false })
        .where(eq(stories.sessionId, input.sessionId));

      // Insert the new story and mark it as active
      const [newStory] = await db.insert(stories).values({
        sessionId: input.sessionId,
        title: input.title,
        description: input.description,
        isActive: true,
      }).returning();

      if (!newStory) throw new Error("Could not add story.");

      // Update the session to point to the new current story and reset votesRevealed status
      await db.update(sessions)
        .set({ currentStoryId: newStory.id, votesRevealed: false })
        .where(eq(sessions.id, input.sessionId));
      
      return newStory;
    }),

  castVote: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      participantId: z.number(),
      // Vote value must be a string and one of the predefined POKER_VALUES
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

      // Upsert vote: insert if new, update if exists for the same story and participant
      const [vote] = await db.insert(votes)
        .values({
          storyId: currentStory.id,
          participantId: input.participantId,
          voteValue: input.voteValue,
        })
        .onConflictDoUpdate({
          // Uses the 'unique_vote_uq' unique constraint on (storyId, participantId)
          target: [votes.storyId, votes.participantId],
          set: { voteValue: input.voteValue, createdAt: new Date() },
        })
        .returning();

      if (!vote) throw new Error("Could not cast or update vote.");

      return vote;
    }),

  revealVotes: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const currentStory = await getCurrentStory(input.sessionId);
      if (!currentStory) {
        throw new Error('No active story to reveal votes for.');
      }
      // Mark votes as revealed for the current session
      await db.update(sessions)
        .set({ votesRevealed: true })
        .where(eq(sessions.id, input.sessionId));
      return { success: true };
    }),

  clearVotesAndNextStory: publicProcedure
    .input(z.object({ sessionId: z.string(), nextStoryId: z.number().optional() }))
    .mutation(async ({ input }) => {
      // Reset votesRevealed status and set the new current story ID (or null if none)
      await db.update(sessions)
        .set({ votesRevealed: false, currentStoryId: input.nextStoryId ?? null })
        .where(eq(sessions.id, input.sessionId));

      if (input.nextStoryId) {
        // If a next story is specified, deactivate all other stories in the session
        await db.update(stories)
          .set({ isActive: false })
          .where(eq(stories.sessionId, input.sessionId));
        // Activate the specified next story
        await db.update(stories)
          .set({ isActive: true })
          .where(and(eq(stories.id, input.nextStoryId), eq(stories.sessionId, input.sessionId)));
      } else {
         // If no next story is specified, deactivate the current active story
        await db.update(stories)
          .set({ isActive: false })
          .where(and(eq(stories.sessionId, input.sessionId), eq(stories.isActive, true))); // Ensure only active one is deactivated
      }
      return { success: true };
    }),
});

