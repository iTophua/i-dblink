import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Greeting({ name }: { name: string }) {
  return <div>Hello {name}</div>
}

describe('Sample test suite for Vitest + React Testing Library', () => {
  it('renders greeting with name', () => {
    render(<Greeting name="Vitest" />)
    expect(screen.getByText('Hello Vitest')).toBeInTheDocument()
  })
})
