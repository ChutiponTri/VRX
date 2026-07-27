import React from 'react'
import TrainingArena from './TrainingArena';

async function page({searchParams}: {searchParams : Promise<{
    userId?: string;
    game?: string;
    diff?: string;
}>}) {

  const params = await searchParams;
  return (
    <TrainingArena searchParams={params} />
  )
}

export default page