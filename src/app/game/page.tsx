import React from 'react'
import GameArena from './GameArena';

export default function page({searchParams}: {searchParams: {
  userId?: string;
  game?: string;
  diff?: string;
  rhr?: string;
}}) {

  return (
    <GameArena searchParams={searchParams}/>
  )
}
