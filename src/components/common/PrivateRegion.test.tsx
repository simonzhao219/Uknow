// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrivateRegion } from './PrivateRegion';

afterEach(cleanup);

describe('PrivateRegion', () => {
  it('以 display:contents 容器包住子節點並帶 block class', () => {
    render(
      <PrivateRegion>
        <span data-testid="child">x</span>
      </PrivateRegion>,
    );
    const wrapper = screen.getByTestId('child').parentElement;
    expect(wrapper?.className).toContain('ph-no-capture');
    expect(wrapper?.className).toContain('contents');
  });
});
