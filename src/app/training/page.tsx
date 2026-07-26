import React from 'react'
import TrainingArena from './TrainingArena';

function page({searchParams}: {searchParams : {
    userId?: string;
    game?: string;
    diff?: string;
}}) {



  return (
    <TrainingArena searchParams={searchParams} />
  )
}

export default page