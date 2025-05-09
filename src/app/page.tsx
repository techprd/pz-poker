"use client";

import Head from 'next/head';
import { useRouter } from 'next/navigation'; 
import { useState } from 'react';
import { api } from '~/trpc/react';

export default function HomePage() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('');
  const [hostName, setHostName] = useState('');
  const [joinSessionId, setJoinSessionId] = useState('');
  const [joinUserName, setJoinUserName] = useState('');

  const createSessionMutation = api.poker.createSession.useMutation({
    onSuccess: (data) => {
      // Store host info for the session page (could use localStorage or context)
      localStorage.setItem(`pokerUser-${data.sessionId}`, JSON.stringify({ id: data.hostId, name: data.hostName, isHost: true }));
      router.push(`/${data.sessionId}`);
    },
    onError: (error) => alert(`Error creating session: ${error.message}`),
  });

  const joinSessionMutation = api.poker.joinSession.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(`pokerUser-${data.sessionId}`, JSON.stringify({ id: data.participantId, name: data.participantName, isHost: false }));
      router.push(`/${data.sessionId}`);
    },
    onError: (error) => alert(`Error joining session: ${error.message}`),
  });

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionName && hostName) {
      createSessionMutation.mutate({ sessionName, hostName });
    } else {
      alert("Please provide a session name and your name.");
    }
  };

  const handleJoinSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinSessionId && joinUserName) {
      joinSessionMutation.mutate({ sessionId: joinSessionId, userName: joinUserName });
    } else {
      alert("Please provide a session ID and your name.");
    }
  };

  return (
    <>
      <Head>
        <title>Pointing Poker</title>
        <meta name="description" content="Real-time pointing poker app" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            PZ <span className="text-sm">Pointing</span> <span className="font-bold bg-gradient-to-r from-orange-700 via-blue-500 to-green-400 text-transparent bg-clip-text animate-gradient">Poker</span>
          </h1>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
            {/* Create Session Form */}
            <form onSubmit={handleCreateSession} className="flex flex-col gap-4 rounded-xl bg-white/10 p-6 shadow-lg backdrop-blur-md">
              <h2 className="text-2xl font-bold">Create New Session</h2>

              <div className="flex flex-col">
                <label htmlFor="sessionName" className="mb-1 text-white font-medium">Session Name</label>
                <input
                  id="sessionName"
                  type="text"
                  placeholder="Session Name"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  className="rounded-md border border-transparent bg-white/20 px-4 py-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex flex-col">
                <label htmlFor="hostName" className="mb-1 text-white font-medium">Your Name (Host)</label>
                <input
                  id="hostName"
                  type="text"
                  placeholder="Your Name (Host)"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="rounded-md border border-transparent bg-white/20 px-4 py-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={createSessionMutation.isPending}
                className="rounded-full bg-purple-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-purple-700 disabled:opacity-50"
              >
                {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
              </button>
            </form>

            {/* Join Session Form */}
            <form onSubmit={handleJoinSession} className="flex flex-col gap-4 rounded-xl bg-white/10 p-6 shadow-lg backdrop-blur-md">
              <h2 className="text-2xl font-bold">Join Existing Session</h2>

              <div className="flex flex-col">
                <label htmlFor="joinSessionId" className="mb-1 text-white font-medium">Session ID</label>
                <input
                  id="joinSessionId"
                  type="text"
                  placeholder="Session ID"
                  value={joinSessionId}
                  onChange={(e) => setJoinSessionId(e.target.value)}
                  className="rounded-md border border-transparent bg-white/20 px-4 py-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex flex-col">
                <label htmlFor="joinUserName" className="mb-1 text-white font-medium">Your Name</label>
                <input
                  id="joinUserName"
                  type="text"
                  placeholder="Your Name"
                  value={joinUserName}
                  onChange={(e) => setJoinUserName(e.target.value)}
                  className="rounded-md border border-transparent bg-white/20 px-4 py-2 text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={joinSessionMutation.isPending}
                className="rounded-full bg-green-600 px-6 py-3 font-semibold text-white shadow-md transition hover:bg-green-700 disabled:opacity-50"
              >
                {joinSessionMutation.isPending ? 'Joining...' : 'Join Session'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}