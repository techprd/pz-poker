"use client"

import Head from 'next/head';
import { useParams, useRouter } from 'next/navigation'; 
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

interface UserInfo {
  id: number;
  name: string;
  isHost: boolean;
}

export default function SessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      const storedUser = localStorage.getItem(`pokerUser-${sessionId}`);
      if (storedUser) {
        try {
            setCurrentUser(JSON.parse(storedUser));
        } catch (e) {
            console.error("Failed to parse user info from localStorage", e);
        }
      } else {
        alert("No user information found for this session. Please join the session again.");
        router.push('/');
      }
    }
  }, [sessionId, router]);

  const { data: sessionDetails, refetch: refetchSessionDetails, isLoading } = api.poker.getSessionDetails.useQuery(
    { sessionId },
    {
      enabled: !!sessionId && !!currentUser,
      refetchInterval: 5000,
      onError: (error) => {
        alert(`Error fetching session: ${error.message}`);
        router.push('/');
      }
    }
  );

  const addStoryMutation = api.poker.addStory.useMutation({
    onSuccess: () => {
      refetchSessionDetails();
      setNewStoryTitle('');
      setSelectedVote(null);
    },
    onError: (error) => alert(`Error adding story: ${error.message}`),
  });

  const castVoteMutation = api.poker.castVote.useMutation({
    onSuccess: () => refetchSessionDetails(),
    onError: (error) => alert(`Error casting vote: ${error.message}`),
  });

  const revealVotesMutation = api.poker.revealVotes.useMutation({
    onSuccess: () => refetchSessionDetails(),
    onError: (error) => alert(`Error revealing votes: ${error.message}`),
  });

  const clearVotesMutation = api.poker.clearVotesAndNextStory.useMutation({
    onSuccess: () => {
        refetchSessionDetails();
        setSelectedVote(null);
    },
    onError: (error) => alert(`Error clearing votes: ${error.message}`),
  });

  const handleAddStory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newStoryTitle && sessionId) {
      addStoryMutation.mutate({ sessionId, title: newStoryTitle });
    }
  };

  const handleCastVote = (voteValue: string) => {
    if (sessionId && currentUser && sessionDetails?.currentStory) {
      setSelectedVote(voteValue);
      castVoteMutation.mutate({
        sessionId,
        participantId: currentUser.id,
        voteValue,
      });
    }
  };

  const handleRevealVotes = () => {
    if (sessionId && sessionDetails?.currentStory) {
      revealVotesMutation.mutate({ sessionId });
    }
  };

  const handleClearVotes = (nextStoryId?: number) => {
    if (sessionId) {
      clearVotesMutation.mutate({ sessionId, nextStoryId });
    }
  };

  const handleSetNextStory = (storyId: number) => {
     handleClearVotes(storyId);
  }

  if (isLoading || !currentUser) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">Loading session...</div>
  );
  if (!sessionDetails) return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">Session not found or error loading.</div>
  );

  const { name: sessionName, participants: sessionParticipants, stories: sessionStories, currentStory, votes: currentVotes, votesRevealed, pokerValues } = sessionDetails;

  const participantMap = new Map(sessionParticipants.map(p => [p.id, p]));
  const participantVotes = new Map(currentVotes?.map(v => [v.participantId, v.voteValue]));

  return (
    <>
      <Head>
        <title>Poker Session: {sessionName}</title>
      </Head>
      <main className="min-h-screen bg-gray-900 p-4 text-white md:p-8">
        <div className="container mx-auto max-w-5xl">
          <button onClick={() => router.push('/')} className="mb-4 rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-700">
            &larr; Back to Home
          </button>
          <h1 className="mb-2 text-3xl font-bold">{sessionName}</h1>
          <p className="mb-6 text-sm text-gray-400">Session ID: <span className="font-mono">{sessionId}</span> (Share this with your team)</p>

          {/* Participants and Votes */}
          <div className="mb-8 rounded-lg bg-gray-800 p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-semibold">Participants ({sessionParticipants.length})</h2>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
              {sessionParticipants.map((p) => {
                const hasVoted = currentStory && participantVotes.has(p.id);
                const voteValue = participantVotes.get(p.id) ?? '';
                return (
                  <div 
                    key={p.id} 
                    className={`
                      relative aspect-[2.5/3.5] 
                      flex flex-col 
                      rounded-xl border-4 
                      p-2 shadow-lg
                      transform transition-all duration-300 hover:scale-105
                      ${hasVoted && !votesRevealed ? 'bg-blue-800 border-blue-500' : 'bg-red-800 border-red-400'}
                      ${votesRevealed ? 'rotate-0' : hasVoted ? 'rotate-0' : 'rotate-0'}
                    `}
                  >
                    {/* Card Corners */}
                    <div className="absolute top-1 left-1 flex flex-col items-start">
                      <span className="text-sm text-white font-bold">{p.isHost ? '♛' : '♟'}</span>
                    </div>
                    <div className="absolute top-1 right-1 flex flex-col items-end">
                      <span className="text-sm text-white font-bold">{p.isHost ? '♛' : '♟'}</span>
                    </div>
                    
                    {/* Name */}
                    <div className="mt-2 text-center">
                      <p className="text-white font-bold truncate text-lg">{p.name}</p>
                      {p.isHost && <span className="text-xs text-yellow-300 font-semibold">(Host)</span>}
                    </div>
                    
                    {/* Card Center - Vote Value */}
                    <div className="flex-grow flex items-center justify-center">
                      {currentStory && (
                        <>
                          {votesRevealed ? (
                            <div className="bg-white rounded-lg w-[70%] h-[70%] flex items-center justify-center">
                              <span className="text-4xl font-bold text-gray-900">
                                {voteValue || 'N/A'}
                              </span>
                            </div>
                          ) : (
                            <div className={`text-center ${hasVoted ? '' : 'opacity-70'}`}>
                              <div className="bg-white/20 rounded-lg w-16 h-16 mx-auto flex items-center justify-center">
                                <span className="text-2xl text-white font-bold">
                                  {hasVoted ? '?' : ''}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-white">
                                {hasVoted ? 'Voted' : 'Waiting...'}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      {!currentStory && (
                        <div className="text-white/50 text-center text-sm">
                          <div className="bg-white/10 rounded-lg w-12 h-12 mx-auto mb-1 flex items-center justify-center">
                            <span className="text-2xl">♠</span>
                          </div>
                          Waiting for story
                        </div>
                      )}
                    </div>
                    
                    {/* Card Corners (Bottom) */}
                    <div className="absolute bottom-1 left-1 flex flex-col items-start rotate-180">
                      <span className="text-sm text-white font-bold">{p.isHost ? '♛' : '♟'}</span>
                    </div>
                    <div className="absolute bottom-1 right-1 flex flex-col items-end rotate-180">
                      <span className="text-sm text-white font-bold">{p.isHost ? '♛' : '♟'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {currentStory && currentUser?.isHost && (
              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleRevealVotes}
                  disabled={revealVotesMutation.isPending || votesRevealed}
                  className="rounded-md bg-green-600 px-5 py-2 font-semibold shadow-md hover:bg-green-700 disabled:opacity-50"
                >
                  {votesRevealed ? 'Votes Revealed' : 'Reveal Votes'}
                </button>
                <button
                  onClick={() => handleClearVotes()}
                  disabled={clearVotesMutation.isPending}
                  className="rounded-md bg-yellow-600 px-5 py-2 font-semibold shadow-md hover:bg-yellow-700 disabled:opacity-50"
                >
                  Clear Votes / New Round
                </button>
              </div>
            )}
            {votesRevealed && currentStory && (
                <div className="mt-4">
                    <h3 className="text-lg font-semibold">Results:</h3>
                    {/* Basic result display, can be enhanced with average, consensus, etc. */}
                    <ul className="list-disc pl-5">
                    {Array.from(participantVotes.entries()).map(([participantId, voteVal]) => (
                        <li key={participantId}>{participantMap.get(participantId)?.name}: {voteVal}</li>
                    ))}
                    </ul>
                </div>
            )}
          </div>

                      {/* Current Story and Voting Area */}
                      <div className="mb-8 rounded-lg bg-gray-800 p-6 shadow-xl">
            {currentStory ? (
              <>
                <h2 className="text-2xl font-semibold">Current Story: {currentStory.title}</h2>
                {currentStory.description && <p className="mt-1 text-gray-300">{currentStory.description}</p>}
                <div className="mt-6">
                  <h3 className="mb-3 text-lg font-medium">Cast Your Vote:</h3>
                  <div className="flex flex-wrap gap-2">
                    {pokerValues.map((value) => (
                      <button
                        key={value}
                        onClick={() => handleCastVote(value)}
                        disabled={castVoteMutation.isPending || votesRevealed}
                        className={`rounded-lg border-2 px-4 py-3 font-bold transition-all duration-150 ease-in-out hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60
                                      ${selectedVote === value ? 'border-purple-500 bg-purple-600 text-white ring-2 ring-purple-400' : 'border-gray-600 bg-gray-700 hover:bg-gray-600'}
                                      ${votesRevealed ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-center text-xl text-gray-400">No story selected for voting. Host can add one below.</p>
            )}
                      </div>

          {/* Host Controls: Add Story / Select Next Story */}
          {currentUser?.isHost && (
            <div className="mb-8 rounded-lg bg-gray-800 p-6 shadow-xl">
              <h2 className="mb-3 text-xl font-semibold">Host Controls</h2>
              <form onSubmit={handleAddStory} className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-grow">
                  <label htmlFor="storyTitle" className="mb-1 block text-sm font-medium text-gray-300">New Story Title:</label>
                  <input
                    id="storyTitle"
                    type="text"
                    value={newStoryTitle}
                    onChange={(e) => setNewStoryTitle(e.target.value)}
                    placeholder="Enter story title or task"
                    className="w-full rounded-md border-gray-600 bg-gray-700 px-3 py-2 placeholder-gray-500 focus:border-purple-500 focus:ring-purple-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addStoryMutation.isPending}
                  className="h-fit rounded-md bg-purple-600 px-5 py-2.5 font-semibold shadow-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {addStoryMutation.isPending ? 'Adding...' : 'Add & Start Voting'}
                </button>
              </form>

              {sessionStories && sessionStories.length > 0 && (
                <div>
                  <h3 className="mb-2 text-lg font-medium">Select Next Story:</h3>
                  <ul className="space-y-2">
                    {sessionStories.filter(s => !s.isActive).map(story => (
                      <li key={story.id} className="flex items-center justify-between rounded-md bg-gray-700 p-3">
                        <span>{story.title}</span>
                        <button
                            onClick={() => handleSetNextStory(story.id)}
                            className="rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-700"
                            disabled={clearVotesMutation.isPending}
                        >
                            Set as Next & Clear Votes
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
