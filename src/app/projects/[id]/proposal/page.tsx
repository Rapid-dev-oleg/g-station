'use client';

import { use } from 'react';
import { Proposal } from '@/components/proposal/Proposal';

export default function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Proposal projectId={id} />;
}
