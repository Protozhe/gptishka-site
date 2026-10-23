const labels={storefront_http:'Сайт',backend_http:'API сайта',gptishka_telegram_bots:'Боты сайта',gptishka_monitor_bot:'Уведомления владельцу',gptishka_receipt_bot:'Чеки',pulse_chat_fallback:'Активации площадок',funpay_telegram_fallback:'Уведомления площадок',pulse_profit:'Прибыль',backup_service:'Резервное копирование'};
const stamp=document.getElementById('stamp'), list=document.getElementById('checks'), resources=document.getElementById('resources');
async function refresh(){
  try{
    const response=await fetch('/ops/status.json',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('unavailable');
    const data=await response.json();
    const age=Date.now()/1000-Number(data.at);
    if(!Number.isFinite(age)||age>180||age < -60)throw new Error('stale');
    stamp.textContent='Проверено '+new Date(data.at*1000).toLocaleString('ru-RU');
    list.replaceChildren();
    for(const [key,label] of Object.entries(labels)){
      const item=document.createElement('li'),ok=data.checks[key]===true;
      item.textContent=(ok?'● ':'! ')+label+(ok?' — работает':' — нужна проверка');item.className=ok?'good':'bad';list.append(item);
    }
    resources.textContent='Свободно на диске: '+(Number(data.disk_free_bytes)/1024**3).toFixed(1)+' ГиБ. Копия: '+(data.backup_at?new Date(data.backup_at*1000).toLocaleString('ru-RU'):'нет свежих данных')+'.';
  }catch{
    stamp.textContent='Свежая проверка недоступна. Проверьте уведомления в @myadminiibot.';list.replaceChildren();resources.textContent='';
  }
}
document.getElementById('refresh').addEventListener('click',refresh);
refresh();setInterval(refresh,60000);
