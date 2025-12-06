import{_ as l,v as e,w as t,V as r,W as i,n as a}from"./index-BS_gOP9p.js";var d,n,s,c,C,m,x,b,f=l({"src/pages/connecting/styles.ts"(){d=e(t.div)`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
`,n=2,s=r`
  0%{ transform:none; }
  25%{ transform:translateX(${n}px); }
  50%{ transform:translateX(-${n}px); }
  75%{ transform:translateX(${n}px); }
  100%{ transform:none; }
`,c=r`
  0%{ opacity:1; }
  100%{ opacity:0; }
`,C=e(t.div)`
  user-select: none;
  position: relative;
  --spinner-error-opacity: 0;
  &:before {
    content: '';
    position: absolute;
    inset: 1px;
    opacity: 0;
    background: var(--pcm-error-color);
    ${o=>o.$circle&&i`
        inset: -5px;
        border-radius: 50%;
        background: none;
        box-shadow: inset 0 0 0 3.5px var(--pcm-error-color);
      `}
  }
  ${o=>o.$shake&&i`
      animation: ${s} 220ms ease-out both;
      &:before {
        animation: ${c} 220ms ease-out 750ms both;
      }
    `}
`,m=e(t.button)`
  z-index: 5;
  appearance: none;
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 16px;
  cursor: pointer;
  overflow: hidden;
  background: none;
  border: none;
  color: var(--pcm-body-background);
  transition: color 200ms ease;
  box-shadow: 0px 2px 6px rgba(0, 0, 0, 0.15);

  &:before {
    z-index: 3;
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 200ms ease;
    background: var(--pcm-body-color);
  }

  &:hover:before {
    opacity: 0.1;
  }
`,x=e(t.div)`
  position: absolute;
  inset: 0;

  &:before {
    z-index: 1;
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 16px;
    background: conic-gradient(from 90deg, currentColor 10%, var(--pcm-accent-color) 80%);
  }

  svg {
    z-index: 2;
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
  }
`,b=e(t.div)`
  position: relative;
  padding: 0;
  margin-top: 28px;
  scale: 0.95;
  opacity: 0;
  will-change: transform, height;
  color: var(--pcm-body-color);
  padding-bottom: 16px;

  div:first-child {
    font-weight: 500;
    margin-bottom: 10px;
    font-size: 16px;
  }

  span {
    color: var(--pcm-body-color-secondary);
    white-space: pre-wrap;
    font-size: 14px;
  }
`}}),p,u,h=l({"src/assets/icons/RetryIconCircle.tsx"(){p=({...o})=>a.jsx("svg",{"aria-hidden":"true",width:"32",height:"32",viewBox:"0 0 32 32",fill:"none",xmlns:"http://www.w3.org/2000/svg",...o,children:a.jsx("path",{fillRule:"evenodd",clipRule:"evenodd",d:"M32 16C32 24.8366 24.8366 32 16 32C7.16344 32 0 24.8366 0 16C0 7.16344 7.16344 0 16 0C24.8366 0 32 7.16344 32 16ZM24.5001 8.74263C25.0834 8.74263 25.5563 9.21551 25.5563 9.79883V14.5997C25.5563 15.183 25.0834 15.6559 24.5001 15.6559H19.6992C19.1159 15.6559 18.643 15.183 18.643 14.5997C18.643 14.0164 19.1159 13.5435 19.6992 13.5435H21.8378L20.071 11.8798C20.0632 11.8724 20.0555 11.865 20.048 11.8574C19.1061 10.915 17.8835 10.3042 16.5643 10.1171C15.2452 9.92999 13.9009 10.1767 12.7341 10.82C11.5674 11.4634 10.6413 12.4685 10.0955 13.684C9.54968 14.8994 9.41368 16.2593 9.70801 17.5588C10.0023 18.8583 10.711 20.0269 11.7273 20.8885C12.7436 21.7502 14.0124 22.2582 15.3425 22.336C16.6726 22.4138 17.9919 22.0572 19.1017 21.3199C19.5088 21.0495 19.8795 20.7333 20.2078 20.3793C20.6043 19.9515 21.2726 19.9262 21.7004 20.3228C22.1282 20.7194 22.1534 21.3876 21.7569 21.8154C21.3158 22.2912 20.8176 22.7161 20.2706 23.0795C18.7793 24.0702 17.0064 24.5493 15.2191 24.4448C13.4318 24.3402 11.7268 23.6576 10.3612 22.4998C8.9956 21.3419 8.0433 19.7716 7.6478 18.0254C7.2523 16.2793 7.43504 14.4519 8.16848 12.8186C8.90192 11.1854 10.1463 9.83471 11.7142 8.97021C13.282 8.10572 15.0884 7.77421 16.861 8.02565C18.6282 8.27631 20.2664 9.09278 21.5304 10.3525L23.4439 12.1544V9.79883C23.4439 9.21551 23.9168 8.74263 24.5001 8.74263Z",fill:"currentColor"})}),u=p}});export{d as C,m as R,b as S,f as a,C as b,x as c,u as d,h as i};
