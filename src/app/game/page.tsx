import React from 'react'
import GameArena from './GameArena';

export default async function page({searchParams}: {searchParams: Promise<{
  userId?: string;
  game?: string;
  diff?: string;
  rhr?: string;
}>}) {

  const params = await searchParams;

  return (
    <GameArena searchParams={params}/>
  )
}
