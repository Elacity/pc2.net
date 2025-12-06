import{i as $,b as L}from"./chunk-G4I34CN4-Cjfo46Os.js";import{_ as a,n as t,r as f,W as s,v as n,w as N}from"./index-CsyZTrGZ.js";var h,C,W=a({"src/assets/icons/CopyIcon2.tsx"(){h=({...e})=>t.jsxs("svg",{"aria-hidden":"true",width:"24",height:"24",viewBox:"0 0 24 24",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:[t.jsx("path",{className:"bg",d:"M14 9.5V7C14 5.89543 13.1046 5 12 5H7C5.89543 5 5 5.89543 5 7V12C5 13.1046 5.89543 14 7 14H9.5",strokeWidth:"1.4"}),t.jsx("rect",{className:"bg",x:"10",y:"10",width:"9",height:"9",rx:"2",strokeWidth:"1.4"}),t.jsx("path",{d:"M1 3L3 5L7 1",strokeWidth:"1.4",strokeLinecap:"round",strokeLinejoin:"round",stroke:"#ffffff"})]}),C=h}}),v,b,c,E=a({"src/components/copyToClipboard/CopyToClipboardIcon.tsx"(){W(),v=n(N.div)`
  transition: all 220ms cubic-bezier(0.175, 0.885, 0.32, 1.1);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 24px;
  svg {
    display: block;
  }
  svg,
  svg path,
  svg rect {
    transition: inherit;
  }
  svg path:first-child {
    transform-origin: 50% 50%;
    fill: var(--pcm-body-background);
    stroke: var(--pcm-body-color-secondary);
  }
  svg rect {
    transform-origin: 53% 63%;
    fill: var(--pcm-body-background);
    stroke: var(--pcm-body-color-secondary);
  }
  svg path:last-child {
    opacity: 0;
    stroke: #fff !important;
    transform: translate(11.75px, 10px) rotate(90deg) scale(0.6);
  }
  ${e=>e.$clipboard?s`
          svg {
            transition-delay: 0ms;
            path:first-child {
              opacity: 0;
              transform: rotate(-90deg) scale(0.2);
            }
            rect {
              rx: 10px;
              fill: var(--pcm-accent-color);
              stroke: var(--pcm-accent-color);
              transform: rotate(-90deg) scale(1.45);
            }
            path:last-child {
              transition-delay: 100ms;
              opacity: 1;
              transform: translate(7.75px, 9.5px);
            }
          }
        `:s`
          &:hover {
          }
          &:hover:active {
          }
        `}
`,b=({copied:e,small:r})=>t.jsx(v,{$clipboard:e,children:t.jsx(C,{style:{transform:r?"scale(1)":"translateX(3px) scale(1.5)",opacity:r||e?1:.6}})}),c=b}}),g,j,S=a({"src/components/copyToClipboard/styles.ts"(){g=n.div`
  transition: all 220ms cubic-bezier(0.175, 0.885, 0.32, 1.1);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  ${e=>e.$disabled?s`
          cursor: not-allowed;
          opacity: 0.4;
        `:s`
          &:hover {
          }
        `}
`,j=n.div`
  display: flex;
  gap: 4px;
  position: relative;
  transition: inherit;
  align-items: center;
  /* svg {
    position: absolute;
    display: block;
    top: -2px;
    margin: 0;
    margin-left: 4px;
  } */
`}}),u,z,V=a({"src/components/copyToClipboard/index.tsx"(){$(),E(),S(),u=({string:e,children:r,variant:w})=>{const[l,d]=f.useState(!1),[p,m]=f.useState("copied-0");let x;function k(i){if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(i).then(()=>{}).catch(o=>{});{const o=document.createElement("textarea");return o.value=i,o.style.position="fixed",o.style.left="-999999px",o.style.top="-999999px",document.body.appendChild(o),o.focus(),o.select(),new Promise((T,_)=>{try{document.execCommand("copy"),document.body.removeChild(o),T(!0)}catch(I){document.body.removeChild(o),_(I)}})}}const y=()=>{if(!e)return;const i=e.trim();k(i),d(!0),m("copied"),clearTimeout(x),x=setTimeout(()=>{d(!1),m("copied-0")},1e3)};return w==="button"?t.jsx(L,{disabled:!e,onClick:y,className:p,children:t.jsxs("div",{style:{display:"flex",gap:"8px",alignItems:"center",overflow:"hidden"},children:[t.jsx("div",{style:{width:"16px"},children:t.jsx(c,{copied:l})}),r]})}):t.jsx(g,{onClick:y,$disabled:!e,className:p,children:t.jsxs(j,{children:[r,t.jsx("div",{style:{display:"flex",alignItems:"center",overflow:"hidden"},children:t.jsx(c,{copied:l,small:!0})})]})})},z=u}});export{z as c,V as i};
