(() => {
  'use strict';
  const id = 'G-68QFPPH0NR', key = 'cs-analytics-consent-v1';
  const paths = new Set(['/', '/index.html', '/residential-cleaning.html', '/deep-cleaning.html', '/move-in-cleaning.html', '/move-out-cleaning.html', '/commercial-cleaning.html', '/cleaning-services-kitchener.html', '/cleaning-services-waterloo.html', '/cleaning-services-cambridge.html']);
  const publicPage = () => paths.has(location.pathname) && ![...new URLSearchParams(location.search).keys()].some(k => !/^(utm_(source|medium|campaign|content|term|id)|gclid)$/i.test(k)) && (!location.hash || /^#(home|services|why-us|team|booking|contact)$/.test(location.hash));
  if (!publicPage()) return;
  let choice = null, loaded = false;
  try { choice = localStorage.getItem(key); } catch {}
  const allowed = new Set(['book_cleaning_click','booking_started','quote_viewed','begin_checkout','booking_request_submitted','cleaner_application','contact_click']);
  const safeLocation = () => location.origin + location.pathname;
  function start() {
    if (loaded || !publicPage()) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window['ga-disable-' + id] = false;
    gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    gtag('js',new Date());
    gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:safeLocation(),page_referrer:''});
    gtag('event','page_view',{page_location:safeLocation(),page_referrer:'',page_title:document.title});
    const script = document.createElement('script'); script.async = true; script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.append(script);
  }
  window.csTrack = (event) => { if (choice === 'yes' && loaded && publicPage() && allowed.has(event)) gtag('event',event,{page_location:safeLocation(),page_referrer:''}); };
  function save(value) {
    choice = value; try { localStorage.setItem(key,value); } catch {}
    if (value === 'yes') { if (loaded) { window['ga-disable-'+id]=false; gtag('consent','update',{analytics_storage:'granted'}); } else start(); }
    else if (loaded) { window['ga-disable-'+id]=true; gtag('consent','update',{analytics_storage:'denied'}); for (const c of document.cookie.split(';')) { const name=c.split('=')[0].trim(); if (/^_ga($|_)/.test(name)) for (const domain of ['', '; domain=cleansure.ca', '; domain=.cleansure.ca']) document.cookie=name+'=; Max-Age=0; path=/'+domain; } }
    panel.hidden=true; preferences.focus();
  }
  const panel=document.createElement('section'); panel.className='cs-consent'; panel.setAttribute('aria-label','Analytics cookie preferences');
  panel.innerHTML='<strong>Cookie preferences</strong><p>Essential storage keeps CleanSure working. With your permission, Google Analytics helps us understand website visits and improve booking. Optional analytics are off unless you accept. You can change your choice anytime.</p><div class="cs-consent-actions"><button type="button" data-choice="no">Reject optional</button><button type="button" data-choice="yes">Accept analytics</button></div>';
  panel.hidden=choice==='yes'||choice==='no';
  const preferences=document.createElement('button'); preferences.type='button'; preferences.className='cs-consent-settings'; preferences.textContent='Cookie preferences'; preferences.onclick=()=>{panel.hidden=false;panel.querySelector('button').focus();};
  panel.addEventListener('click',e=>{const value=e.target.dataset.choice;if(value)save(value);});
  document.body.append(panel,preferences);
  document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'';if(href==='#booking'||href==='/#booking')window.csTrack('book_cleaning_click');else if(/^(mailto:|tel:)/.test(href))window.csTrack('contact_click');});
  if(choice==='yes')start();
})();
