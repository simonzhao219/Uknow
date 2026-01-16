import { useEffect } from 'react';

/**
 * 处理 Safari bfcache 页面恢复问题
 * 
 * Safari 的 Back-Forward Cache 会缓存整个页面状态，
 * 包括滚动位置、DOM 状态、JavaScript 变量等。
 * 当用户通过返回/前进按钮回到页面时，可能导致：
 * - 横向滚动容器停在中间位置
 * - 响应式布局状态错误
 * - CSS 类状态不正确
 * 
 * 此 Hook 会在页面从 bfcache 恢复时执行重置操作。
 * 
 * @example
 * ```tsx
 * import { usePageRestoration } from '../hooks/usePageRestoration';
 * 
 * export function MyComponent() {
 *   usePageRestoration();
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function usePageRestoration() {
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        console.log('🔄 页面从 bfcache 恢复，执行重置操作...');
        
        // 1. 重置所有横向滚动容器到最左边
        const scrollContainers = document.querySelectorAll('.overflow-x-auto');
        scrollContainers.forEach(container => {
          (container as HTMLElement).scrollLeft = 0;
        });
        
        // 2. 触发 resize 事件，让响应式组件重新计算布局
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
        
        // 3. 强制重绘（修复 Safari 可能的渲染缓存问题）
        // 这是一个常见的修复 Safari 渲染 bug 的技巧
        const body = document.body;
        const originalDisplay = body.style.display;
        body.style.display = 'none';
        
        // 使用 requestAnimationFrame 确保重绘发生
        requestAnimationFrame(() => {
          body.style.display = originalDisplay;
        });
      }
    };
    
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);
}
