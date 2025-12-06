import{i as s,F as r,a as n}from"./chunk-AHPYJJP6-D42v0ZU5.js";import{_ as p,V as d,v as o,w as a,W as e}from"./index-BS_gOP9p.js";var i,c,l,h,f=p({"src/components/socialLogin/styles.ts"(){s(),i=d`
from { opacity: 0; }
  to { opacity: 1; }
`,c=o(a.div)`
  width: 100%;
  display: flex;
  justify-content: space-between;
  transform: translateZ(0);
  flex-wrap: wrap;
  flex-direction: ${t=>t.$felxRow?"row":"column"};
  gap: ${t=>t.$felxRow?"0px":"12px"};
`,l=o(a.div)`
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  border: 1px solid var(--pcm-button-border-color);
  transition: 0.2s ease width;
  cursor: pointer;
  opacity: 0;
  animation: ${i} 300ms ease-out both;
  position: relative;
  user-select: none;

  ${t=>t.$isDisabled?e`
        opacity: 0.5 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
      `:e``}

  ${t=>t.$felxRow?e`
        padding: 0;
        width: 46px;
        border-radius: var(--pcm-rounded-full);
        justify-content: center;
      `:e`
      padding-left: 16px;
      padding-right: 16px;
      width: 100%;
      border-radius: var(--pcm-rounded-lg);
      justify-content: flex-start;
      ${r} {
        svg {
          height: inherit;
          width: inherit;
        }
      }
      @media only screen and (min-width: 560px) {
        &:hover {
          ${n} {
            opacity: 0;
            transform: translateX(-15px);
          }
          ${r} {
            opacity: 1;
            transform: translateX(10px);
          }
        }
      }

      @media only screen and (max-width: 560px) {
        &:hover:active {
          ${n} {
            opacity: 0;
            transform: translateX(-15px);
          }
          ${r} {
            opacity: 1;
            transform: translateX(10px);
          }
        }
      }
    `}

  @media only screen and (min-width: 560px) {
    &:hover {
      box-shadow: var(--pcm-button-hover-shadow);
    }
  }

  @media only screen and (max-width: 560px) {
    &:hover:active {
      box-shadow: var(--pcm-button-hover-shadow);
    }
  }

  svg {
    object-fit: cover;
    ${t=>t.$felxRow?e`
          height: 30px;
          width: 30px;
        `:e`
        height: 22px;
        width: 22px;
      `}
  }

  span {
    font-weight: 500;
    font-size: 14px;
    white-space: nowrap;
    text-align: center;
    text-transform: capitalize;
    display: ${t=>t.$felxRow?"none":"block"};
  }
`,h=o(a.div)`
  height: 47px;
  width: 47px;
  cursor: pointer;
  border-radius: var(--pcm-rounded-full);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pcm-body-background-secondary);
  opacity: 0;
  animation: ${i} 300ms ease-out both;

  &:hover {
    box-shadow: var(--pcm-button-hover-shadow);
  }
  svg {
    height: 25px;
    width: 25px;
    object-fit: cover;
  }
`}});export{c as S,h as T,l as a,f as i};
