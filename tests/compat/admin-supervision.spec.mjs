import {test,expect} from '@playwright/test';

test('platform supervision loads on demand and checks a closed thread without writing',async({page})=>{
  const requests=[];
  await page.route('**/api/**',route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    requests.push({method:request.method(),path,params:[...url.searchParams]});
    const data={
      '/api/session':{user:{id:'100000000000000001',name:'Max'},permissions:['admin','access'],manager:true,community:{id:'spm',name:'Test',shortName:'T',appearance:{}},communities:[]},
      '/api/members':{members:[],permissions:['access','admin']},
      '/api/community/settings':{community:{name:'Test'},modules:{},permissions:['access','admin'],roles:[],crews:{}},
      '/api/community/setup':{community:{name:'Test'},guild:{id:'1',name:'Test',botPresent:true},rolesConfigured:true},
      '/api/platform/communities':{communities:[],testSite:true},
      '/api/platform/community-requests':{requests:[]},
      '/api/races':{events:[]},
      '/api/platform/discord/supervision':{generatedAt:1795500000000,botConfigured:true,development:true,communities:[
        {name:'SPM',slug:'spm',state:'recorded',issues:[],errors:[],closedThreads:[{name:'8 H Bahreïn',eventId:'race-1',closedAt:1795500000000}]}
      ]},
      '/api/platform/discord/supervision/thread':{state:'missing'}
    };
    return route.fulfill({json:data[path]??{ok:true}});
  });
  await page.goto('/members.html#platform');
  const panel=page.locator('[data-bot-supervision]');
  await expect(panel).toBeVisible();
  expect(requests.some(item=>item.path.endsWith('/discord/supervision'))).toBe(false);
  await panel.locator(':scope > summary').press('Enter');
  await panel.getByText('SPM ·',{exact:false}).first().press('Enter');
  await panel.getByText('Fils fermés récemment',{exact:true}).press('Enter');
  await panel.getByRole('button',{name:'Vérifier sur Discord'}).click();
  await expect(panel.getByRole('status').last()).toHaveText('Introuvable sur Discord');
  expect(requests.find(item=>item.path.endsWith('/supervision/thread'))).toEqual({
    method:'GET',path:'/api/platform/discord/supervision/thread',params:[['community','spm'],['event','race-1']]
  });
  expect(requests.every(item=>item.method==='GET')).toBe(true);
});
