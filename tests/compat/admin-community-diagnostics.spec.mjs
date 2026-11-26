import {test, expect} from '@playwright/test';

test('community Discord diagnostics load on demand and can verify a thread without writing', async ({page}) => {
  const calls = [];
  await page.route('**/api/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    const data = {
      '/api/session':{user:{id:'100000000000000001',name:'Admin test'},permissions:['admin','access'],community:{id:'spm',name:'Test',appearance:{}},communities:[]},
      '/api/members':{members:[],permissions:['access','admin']},
      '/api/community/settings':{community:{name:'Test'},modules:{},permissions:['access','admin'],roles:[],crews:{}},
      '/api/community/setup':{community:{name:'Test'},guild:{id:'1',name:'Test',botPresent:true},rolesConfigured:true,botRecap:{enabled:true,mode:'general'}}
    };
    if (url.pathname === '/api/community/discord/diagnostic') {
      calls.push([request.method(), url.search]);
      const checkedLive = url.searchParams.get('live') === '1';
      return route.fulfill({json:{
        recap:{on:true,sameServer:true}, voices:{on:false}, announcement:{},
        threads:[{name:'6 h de Spa',sim:'lmu',state:checkedLive ? 'missing' : 'ok'}], crews:[], checkedLive
      }});
    }
    return route.fulfill({json:data[url.pathname] ?? {}});
  });
  await page.goto('/members.html#discord');
  const panel = page.locator('[data-discord-diagnostic]');
  await expect(panel).toBeAttached();
  expect(calls).toEqual([]);
  await panel.locator(':scope > summary').press('Enter');
  await expect(panel.getByText('6 h de Spa')).toBeAttached();
  await expect(panel.getByText('✓ En place')).toBeAttached();
  await panel.getByRole('button',{name:'Vérifier sur Discord'}).press('Enter');
  await expect(panel.getByText('Introuvable sur Discord')).toBeAttached();
  expect(calls).toEqual([['GET',''],['GET','?live=1']]);
});
