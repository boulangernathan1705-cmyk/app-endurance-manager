import {test,expect} from '@playwright/test';
test('Gridfest send button works when race list omits the secret',async({page})=>{
 let sends=0;
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;let data={ok:true};if(path.endsWith('/gridfest/passwords')){if(route.request().method()==='POST')sends++;data={ready:true,botReady:true,waiting:0,pilots:[{name:'Nathan',status:'sent'}],results:[{status:'sent'}],nextCursor:''};}else if(path==='/api/session')data={user:{id:'111111111111111111',name:'Nathan',communityIntroSeen:true},access:'member',permissions:['access','admin'],community:{id:'alpha',slug:'alpha',name:'Alpha',modules:{soloRaces:true}},communities:[]};else if(['/api/events','/api/races'].includes(path))data={events:[]};else if(path.includes('notifications'))data={notifications:[],unread:0};return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/lmu/');await page.waitForFunction(async()=>{const {state}=await import('/front/app/core.mjs');return Boolean(state.user);});
 await page.evaluate(async()=>{const {state,app}=await import('/front/app/core.mjs');state.grindfest=true;state.permissions=['admin'];state.busy=false;const race={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:1,format:'solo',details:{type:'Gridfest'}};state.events=[race];state.currentEventId=race.id;const {gridfestPasswordPanel}=await import('/front/app/grindfest.mjs');app.innerHTML=gridfestPasswordPanel(race);});
 await expect(page.getByRole('button',{name:'Envoyer le mot de passe',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Configurer le mot de passe',exact:true})).toHaveAttribute('data-id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Envoyer le mot de passe',exact:true}).click();
 await expect(page.locator('[data-gridfest-password-status]')).toContainText('1 / 1');expect(sends).toBe(1);
 await expect(page.locator('[data-kind="registration"]')).toHaveCount(0);
});
