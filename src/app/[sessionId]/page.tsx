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
  const [isFlipping, setIsFlipping] = useState(false);
  const [flyingNumber, setFlyingNumber] = useState<{value: string, color: string, active: boolean}>({value: "", color: "", active: false});
  const [flyingNumberPosition, setFlyingNumberPosition] = useState({startX: 0, startY: 0, endX: 0, endY: 0});

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

  const handleCastVote = (voteValue: string, chipColor: string, event: React.MouseEvent) => {
    if (sessionId && currentUser && sessionDetails?.currentStory) {
      // Get the position of the clicked chip
      const chipRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const chipCenterX = chipRect.left + chipRect.width / 2;
      const chipCenterY = chipRect.top + chipRect.height / 2;
      
      // Find the current user's card in the DOM
      const userCards = document.querySelectorAll('[data-participant-id]');
      let userCardElement: Element | null = null;
      
      userCards.forEach(card => {
        if (card.getAttribute('data-participant-id') === currentUser.id.toString()) {
          userCardElement = card;
        }
      });
      
      if (userCardElement) {
        const cardRect = userCardElement.getBoundingClientRect();
        const cardCenterX = cardRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top + cardRect.height / 2;
        
        // Set flying number and its positions
        setFlyingNumber({
          value: voteValue,
          color: chipColor.includes('text-white') ? 'text-white' : 'text-gray-900',
          active: true
        });
        
        setFlyingNumberPosition({
          startX: chipCenterX,
          startY: chipCenterY,
          endX: cardCenterX,
          endY: cardCenterY
        });
        
        // After animation, set the selected vote and send to server
        setTimeout(() => {
          setFlyingNumber(prev => ({...prev, active: false}));
          setSelectedVote(voteValue);
          castVoteMutation.mutate({
            sessionId,
            participantId: currentUser.id,
            voteValue,
          });
        }, 1000); // Match this with the animation duration
      } else {
        // Fallback if we can't find the user's card element
        setSelectedVote(voteValue);
        castVoteMutation.mutate({
          sessionId,
          participantId: currentUser.id,
          voteValue,
        });
      }
    }
  };

  const handleRevealVotes = () => {
    if (sessionId && sessionDetails?.currentStory) {
      // Start the flip animation sequence
      setIsFlipping(true);
      
      // Wait for cards to visibly flip halfway before revealing data
      setTimeout(() => {
        // Call API to reveal votes data
        revealVotesMutation.mutate({ sessionId });
        
        // Keep the flipping state active until animation completes
        // Using a longer time to account for the staggered delays
        setTimeout(() => {
          setIsFlipping(false);
        }, 1500);
      }, 800);
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
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fly-to-card {
          0% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
          }
          80% {
            opacity: 0.9;
            transform: translate(
              calc(${flyingNumberPosition.endX - flyingNumberPosition.startX}px),
              calc(${flyingNumberPosition.endY - flyingNumberPosition.startY}px)
            ) scale(0.7);
          }
          100% {
            opacity: 0;
            transform: translate(
              calc(${flyingNumberPosition.endX - flyingNumberPosition.startX}px),
              calc(${flyingNumberPosition.endY - flyingNumberPosition.startY}px)
            ) scale(0);
          }
        }
        
        .flying-number {
          position: fixed;
          z-index: 100;
          pointer-events: none;
          left: ${flyingNumberPosition.startX}px;
          top: ${flyingNumberPosition.startY}px;
          font-weight: bold;
          font-size: 24px;
          animation: fly-to-card 1s cubic-bezier(0.215, 0.610, 0.355, 1);
          transform-origin: center center;
        }
      ` }} />
      <main className="min-h-screen bg-gray-900 p-4 text-white md:p-8">
        {/* Flying number animation */}
        {flyingNumber.active && (
          <div className={`flying-number ${flyingNumber.color}`}>
            {flyingNumber.value}
          </div>
        )}
        <div className="container mx-auto max-w-5xl">
          <button onClick={() => router.push('/')} className="mb-4 rounded bg-blue-600 px-3 py-1 text-sm hover:bg-blue-700">
            &larr; Back to Home
          </button>
          <h1 className="mb-2 text-3xl font-bold">{sessionName}</h1>
          <p className="mb-6 text-sm text-gray-400">Session ID: <span className="font-mono">{sessionId}</span> (Share this with your team)</p>

          {/* Participants and Votes */}
          <div className="mb-8 rounded-lg bg-gray-800 p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-semibold">Participants ({sessionParticipants.length})</h2>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {sessionParticipants.map((p) => {
                const hasVoted = currentStory && participantVotes.has(p.id);
                const voteValue = participantVotes.get(p.id) ?? '';
                
                // Card suit - assign a random suit to each participant (can be based on id)
                const suits = ['♠', '♥', '♦', '♣'];
                const suitIndex = p.id % suits.length;
                const suit = suits[suitIndex];
                
                // Color based on suit
                const isRedSuit = suit === '♥' || suit === '♦';
                const suitColor = isRedSuit ? 'text-red-500' : 'text-gray-900';
                
                return (
                  <div 
                    key={p.id} 
                    className="relative aspect-[2.5/3.5] w-full"
                    style={{ perspective: "1000px" }}
                    data-participant-id={p.id}
                  >
                    {/* Card Flip Container */}
                    <div 
                      className={`
                        relative w-full h-full 
                        transition-all duration-1000 ease-in-out
                        hover:scale-105
                      `}
                      style={{ 
                        transformStyle: "preserve-3d",
                        transform: votesRevealed || isFlipping ? "rotateY(180deg)" : "",
                        transitionDelay: isFlipping ? `${p.id % 5 * 0.15}s` : "0s"
                      }}
                    >
                      {/* Card Back (hidden when flipped) */}
                      <div 
                        className="absolute w-full h-full backface-hidden rounded-lg shadow-md"
                        style={{ 
                          backfaceVisibility: "hidden",
                          borderWidth: "2px",
                          borderStyle: "solid",
                          borderColor: hasVoted ? "#3b82f6" : "#94a3b8", // blue for voted, gray otherwise
                          background: `linear-gradient(135deg, #334155, #1e293b)` // dark blue gradient
                        }}
                      >
                        {/* Only show the user's own vote on their card */}
                        {currentUser && p.id === currentUser.id && hasVoted && !votesRevealed && (
                          <div className="absolute top-3 right-3 flex items-center justify-center">
                            <div className="bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg opacity-90 z-10">
                              {voteValue}
                            </div>
                          </div>
                        )}
                        {/* Card Back Design */}
                        <div className="h-full w-full relative">
                          {/* Diagonal Pattern */}
                          <div className="absolute inset-0" 
                            style={{
                              background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1) 5px, transparent 5px, transparent 12px)",
                              opacity: 0.3
                            }}
                          ></div>
                          
                          {/* Central Logo */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 bg-white bg-opacity-90 rounded-full flex items-center justify-center border-2 border-gray-300">
                              <span className="text-blue-800 text-2xl font-bold">P</span>
                            </div>
                          </div>
                          
                          {/* Name Badge */}
                          <div className="absolute top-2 inset-x-0">
                            <p className="mx-auto w-max bg-white bg-opacity-90 rounded px-2 py-0.5 text-gray-800 font-bold text-xs">
                              {p.name}
                              {p.isHost && <span className="ml-1 text-amber-600">♦</span>}
                            </p>
                          </div>
                          
                          {/* Voted Status */}
                          {hasVoted && (
                            <div className="absolute bottom-3 inset-x-0 flex justify-center">
                              <span className={`
                                px-2 py-0.5 bg-blue-500 rounded-full text-white text-xs font-medium
                                ${currentUser && p.id === currentUser.id && selectedVote === voteValue ? 'animate-pulse' : ''}
                              `}>
                                Voted
                              </span>
                            </div>
                          )}
                          
                          {/* Vote received effect for current user */}
                          {currentUser && p.id === currentUser.id && selectedVote === voteValue && (
                            <div className="absolute inset-0 rounded-lg animate-ping" 
                              style={{
                                animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) 1",
                                border: "2px solid #3b82f6",
                                opacity: 0
                              }}
                            />
                          )}
                          
                          {/* Decoration */}
                          <div className="absolute top-2 left-2 text-white font-bold opacity-70 text-sm">
                            {p.isHost ? 'H' : 'P'}
                          </div>
                          <div className="absolute bottom-2 right-2 text-white font-bold opacity-70 text-sm transform rotate-180">
                            {p.isHost ? 'H' : 'P'}
                          </div>
                        </div>
                      </div>
                      
                      {/* Card Front (visible when flipped) */}
                      <div 
                        className="absolute w-full h-full backface-hidden bg-white rounded-lg p-1 shadow-md border-2 border-gray-300"
                        style={{ 
                          backfaceVisibility: "hidden",
                          transform: "rotateY(180deg)"
                        }}
                      >
                        {/* Card Corners - Top Left */}
                        <div className="absolute top-1 left-1 flex flex-col items-start">
                          <span className={`text-sm font-bold ${suitColor}`}>{voteValue || '?'}</span>
                          <span className={`text-sm ${suitColor}`}>{suit}</span>
                        </div>
                        
                        {/* Name Badge */}
                        <div className="mt-2 text-center">
                          <p className="bg-gray-100 rounded px-1 text-gray-800 font-bold truncate text-xs">{p.name}</p>
                          {p.isHost && <span className="text-[10px] text-yellow-700 font-semibold">(Host)</span>}
                        </div>
                        
                        {/* Card Center - Vote Value */}
                        <div className="flex-grow flex items-center justify-center">
                          <div className="flex items-center justify-center">
                            <span className={`text-3xl font-bold ${suitColor}`}>
                              {voteValue || '?'}
                            </span>
                            <span className={`text-3xl ml-1 ${suitColor}`}>{suit}</span>
                          </div>
                        </div>
                        
                        {/* Card Corners - Bottom Right (inverted) */}
                        <div className="absolute bottom-1 right-1 flex flex-col items-end rotate-180">
                          <span className={`text-sm font-bold ${suitColor}`}>{voteValue || '?'}</span>
                          <span className={`text-sm ${suitColor}`}>{suit}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {currentStory && currentUser?.isHost && (
              <div className="mt-6 flex gap-4">
                <button
                  onClick={handleRevealVotes}
                  disabled={revealVotesMutation.isPending || votesRevealed || isFlipping}
                  className={`
                    rounded-md px-5 py-2 font-semibold shadow-md 
                    transition-all duration-300
                    disabled:opacity-50 relative overflow-hidden
                    ${isFlipping ? 'bg-yellow-500 text-gray-800' : 
                      votesRevealed ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}
                  `}
                >
                  {isFlipping ? (
                    <div className="flex items-center justify-center">
                      <span className="animate-pulse">Revealing Cards</span>
                      <span className="ml-2 inline-block animate-spin">🎴</span>
                    </div>
                  ) : votesRevealed ? (
                    <div className="flex items-center justify-center">
                      <span>Cards Revealed</span>
                      <span className="ml-2">👁️</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <span>Flip All Cards</span>
                      <span className="ml-2 inline-block transition-transform duration-300 group-hover:rotate-180">🔄</span>
                    </div>
                  )}
                  
                  {/* Add shine effect on hover */}
                  <div className="absolute inset-0 card-shine"></div>
                </button>
                <button
                  onClick={() => handleClearVotes()}
                  disabled={clearVotesMutation.isPending}
                  className="rounded-md bg-yellow-600 px-5 py-2 font-semibold shadow-md hover:bg-yellow-700 disabled:opacity-50"
                >
                  New Deal
                </button>
              </div>
            )}
            {votesRevealed && currentStory && (
                <div className="mt-4">
                    <h3 className="text-lg font-semibold">Hand Results:</h3>
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
                  <h3 className="mb-3 text-lg font-medium">Place Your Bet:</h3>
                  <div className="flex flex-wrap gap-4">
                    {pokerValues.map((value, index) => {
                      // Determine chip color based on value or index
                      const chipColors = [
                        "bg-white border-gray-300 text-gray-900", // white
                        "bg-red-600 border-red-800 text-white",   // red
                        "bg-blue-600 border-blue-800 text-white", // blue
                        "bg-green-600 border-green-800 text-white", // green
                        "bg-yellow-500 border-yellow-700 text-gray-900", // yellow
                        "bg-purple-600 border-purple-800 text-white", // purple
                        "bg-black border-gray-800 text-white",    // black
                        "bg-gray-500 border-gray-700 text-white"  // gray
                      ];
                      const colorIndex = index % chipColors.length;
                      
                      return (
                        <button
                          key={value}
                          onClick={(e) => handleCastVote(value, chipColors[colorIndex], e)}
                          disabled={castVoteMutation.isPending || votesRevealed}
                          className={`
                            relative rounded-full w-16 h-16 
                            border-4 font-bold 
                            transition-all duration-150 ease-in-out 
                            hover:scale-110 
                            disabled:cursor-not-allowed disabled:opacity-60
                            ${chipColors[colorIndex]}
                            ${selectedVote === value ? 
                              'ring-4 ring-yellow-400 ring-opacity-70 shadow-lg transform scale-110' : ''}
                            ${votesRevealed ? 'cursor-not-allowed opacity-60' : ''}
                          `}
                        >
                          {/* Inner circle */}
                          <div className="absolute inset-2 rounded-full border-2 border-opacity-30 flex items-center justify-center">
                            <span className="text-2xl font-bold relative group-hover:animate-pulse">{value}</span>
                            {/* Add click effect */}
                            {selectedVote === value && (
                              <span className="absolute inset-0 rounded-full bg-current opacity-10 animate-ping"></span>
                            )}
                          </div>
                          
                          {/* Edge pattern (dots around edge) */}
                          <div className="absolute inset-0 rounded-full">
                            {[...Array(8)].map((_, i) => (
                              <div 
                                key={i} 
                                className="absolute w-1.5 h-1.5 rounded-full bg-current opacity-60"
                                style={{
                                  top: `${50 - 45 * Math.sin(i * Math.PI / 4)}%`,
                                  left: `${50 + 45 * Math.cos(i * Math.PI / 4)}%`,
                                }}
                              />
                            ))}
                          </div>
                        </button>
                      );
                    })}
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
                            Deal This Hand
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
