import{i as f,a as w}from"./chunk-QH6JFFQS-DB5BAood.js";import{_ as e,n as r,w as p,W as o,v as a}from"./index-CRQsZryZ.js";var l,m,k=e({"src/assets/icons/ButtonLoadingIcon.tsx"(){l=({...t})=>r.jsxs(p.svg,{fill:"none",viewBox:"0 0 24 24",xmlns:"http://www.w3.org/2000/svg",...t,animate:{rotate:360},transition:{repeat:1/0,duration:1,ease:"linear"},children:[r.jsx("circle",{cx:"12",cy:"12",r:"10",stroke:"currentColor",strokeWidth:"4",opacity:.25}),r.jsx("path",{opacity:.75,d:"M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z",fill:"currentColor"})]}),m=l}}),v,h,j=e({"src/components/button/styles.ts"(){v=a.button`
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  cursor: pointer;
  width: 100%;

  border-radius: var(--pcm-rounded-lg);
  font-weight: var(--pcm-button-font-weight);
  height: 47px;
  border: none;

  ${({$color:t})=>{if(t==="primary")return o`
        background: var(--pcm-primary-button-bankground);
        color: var(--pcm-primary-button-color);
        &:hover {
          background: var(--pcm-primary-button-hover-background);
        }
      `;if(t==="secondary")return o`
        background: var(--pcm-secondary-button-bankground);
        color: var(--pcm-secondary-button-color);
        &:hover {
          background: var(--pcm-secondary-button-hover-background);
        }
      `}}

  ${({$disabled:t,$loading:n})=>(t||n)&&o`
      cursor: not-allowed;
      pointer-events: none;
      opacity: 0.5;
      div {
        opacity: 0.5;
      }
    `}

  &:hover {
    box-shadow: var(--pcm-button-hover-shadow);
  }
`,a.div`
  display: inline-block;
  margin-right: 8px;
`,h=a(p.div)`
  position: relative;
  display: inline-block;
  vertical-align: middle;
  max-width: 20px;
  max-height: 20px;
  margin: 0 10px;
  &:first-child {
    margin-left: 0;
  }
  &:last-child {
    margin-right: 0;
  }
  ${t=>t.$rounded&&o`
        overflow: hidden;
        border-radius: var(--pcm-rounded-sm);
      `}
  svg {
    display: block;
    position: relative;
    max-width: 100%;
    height: auto;
  }
`}}),u,_,C=e({"src/components/button/index.tsx"(){k(),f(),j(),u=({children:t,style:n,loading:i=!1,disabled:s=!1,color:g="primary",roundedIcon:b,onClick:c,icon:d,...x})=>r.jsxs(v,{style:n,onClick:y=>{!s&&!i&&c&&c(y)},$loading:!!i,$disabled:s,$color:g,...x,children:[i&&r.jsx(m,{style:{width:"20px",marginRight:"6px"}}),r.jsxs(w,{gap:6,children:[d&&r.jsx(h,{$rounded:b,children:d}),t]})]}),_=u}});export{_ as b,C as i};
