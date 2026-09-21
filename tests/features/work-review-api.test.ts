import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),audit:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/auth/guard',()=>({requireRole:async()=>({tenantId:'tenant',userId:'teacher',role:'teacher'})}));
vi.mock('@/lib/database/admin',()=>({adminDb:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/security/audit',()=>({recordAudit:mocks.audit}));
import { POST } from '@/app/api/topics/review/route';
const item={id:'24a56503-c67f-4268-8837-2f107536d379',revision:0,title:'一次関数',body:'傾きの意味を教えて',content:'傾きと切片を学んだ',difficulty:2,dueAt:'2026-10-01T11:00:00+00:00'};
const request=(items:unknown)=>new Request('http://localhost/api/topics/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({publish:true,items})});
beforeEach(()=>{mocks.rpc.mockReset();mocks.audit.mockReset();mocks.rpc.mockResolvedValue({data:1,error:null});});
describe('課題の一括確認API',()=>{
  it('DBから返るタイムゾーン付きの期限を承認できる',async()=>{
    const response=await POST(request([item]));
    expect(response.status).toBe(200);expect(await response.json()).toEqual({count:1});
    expect(mocks.rpc).toHaveBeenCalledWith('review_explanation_works',expect.objectContaining({p_publish:true,p_items:[item]}));
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it('版番号が欠けた課題はDBへ送らない',async()=>{
    const response=await POST(request([{...item,revision:undefined}]));
    expect(response.status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('確認後の競合を利用者へ返し、成功の監査を残さない',async()=>{
    mocks.rpc.mockResolvedValue({error:{code:'P0001',message:'課題が更新されています。画面を更新して再確認してください'}});
    const response=await POST(request([item]));
    expect(response.status).toBe(400);expect((await response.json()).message).toContain('再確認');expect(mocks.audit).not.toHaveBeenCalled();
  });
});
