'use client';
import { useEffect, useRef, useState } from 'react';
import { ChatClient, type ChatMessage } from './chat-client';
type Result = { conversation: { id:string; state:string }; messages:ChatMessage[] };
export function TutorialLauncher() {
  const request = useRef<Promise<Result> | null>(null);
  const [result,setResult] = useState<Result | null>(null);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let cancelled=false;
    request.current ??= fetch('/api/student-tutorial',{method:'POST'}).then(async response=>{
      const data=await response.json();
      if(!response.ok) throw new Error(data.message ?? '練習を開始できませんでした');
      return data as Result;
    });
    void request.current.then(data=>{if(!cancelled)setResult(data);}).catch(e=>{if(!cancelled)setError(e instanceof Error ? e.message : '通信に失敗しました');});
    return ()=>{cancelled=true;};
  },[attempt]);
  if(error) return <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm"><p>{error}</p><button onClick={()=>{request.current=null;setError('');setAttempt(n=>n+1);}} className="mt-2 font-bold underline">もう一度読み込む</button></div>;
  if(!result) return <p role="status" className="p-6 text-sm text-slate-500">はじめの案内を読み込んでいます…</p>;
  return <ChatClient key={result.conversation.id} conversationId={result.conversation.id} initialMessages={result.messages} initialCompleted={result.conversation.state==='completed'} tutorial />;
}
