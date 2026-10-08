// One learning sequence, followed by mixed practice across all expression forms.
let mixing=false;
const mixedOrder=[2,5,0,4,1,6,3],mixedPassed=new Set();
const topicReady=()=>independent[topic].size>=2;
unlocked=function(){return mixing&&mixedPassed.size===7;};
const branchingStep=setStep;
setStep=function(s){if(s===1&&step===0&&!mixing){const pending=independent.findIndex(a=>a.size<2);topic=pending<0?0:pending;variant=0;routeLevel=4;formulaSupport=notationSupport=4;}branchingStep(s);};
const branchingCheck=check;
check=function(v){branchingCheck(v);if(solved&&formulaSupport===0&&notationSupport===0&&!usedFormulaHelp&&!usedNotationHelp&&!formulaMistake&&!notationMistake&&mixing){mixedPassed.add(topic);render();}};
const branchingNext=nextPractice;
nextPractice=function(){if(!solved)return;if(mixing){if(mixedPassed.has(topic)){const next=mixedOrder.find(t=>!mixedPassed.has(t));if(next!==undefined){topic=next;variant++;routeLevel=0;formulaSupport=notationSupport=0;reset();render();return;}}branchingNext();return;}if(topicReady()){if(topic<6){topic++;variant=0;routeLevel=4;nextRouteLevel=4;formulaSupport=notationSupport=4;routeMessage='次の書き方も、一緒に考えよう。';reset();render();return;}mixing=true;topic=mixedOrder[0];variant++;routeLevel=0;formulaSupport=notationSupport=0;routeMessage='いろいろな問題を、自分で解いてみよう。';reset();render();return;}branchingNext();};
nextNotebook=function(){const i=mixedOrder.indexOf(topic);topic=mixedOrder[(i+1)%7];variant++;reset();render();};
const sequenceRender=render;
render=function(){sequenceRender();const app=document.querySelector('#app');app.innerHTML=app.innerHTML.replace(/<label>学ぶ内容 <select[\s\S]*?<\/select><\/label>/g,`<span class="muted">${step===2?'いろいろな文字式':topics[topic].name}</span>`);if(step===1){app.innerHTML=app.innerHTML.replace(/支援なしで解けた別の問題：[\s\S]*?<\/p>/,mixing?`まぜて確認：${mixedPassed.size} / 7種類<br>困ったら、Webがヒントを戻します。</p>`:`支援なしで解けた別の問題：${independent[topic].size} / 2<br>解けたら、次の書き方へ進みます。</p>`);app.innerHTML=`<p class="muted">${mixing?'いろいろな文字式をまぜて確認':`書き方 ${topic+1} / 7`}　${topics[topic].name}</p>`+app.innerHTML;}if(step===0){const last=topic===0?3:2;if(viewStage===last&&topic<6)app.innerHTML+=`<button onclick="setTopic(${topic+1})">次の書き方を見る</button>`;}document.querySelector('#nav').innerHTML=document.querySelector('#nav').innerHTML.replace('別の2問を支援なしで解いてから進みます','すべての書き方を練習し、まぜた問題を支援なしで解いてから進みます');};
reset();render();
