import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Combobox, type ComboboxOption } from '@/components/Combobox'

const seniorityOptions: ComboboxOption[] = [
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
]

describe('Combobox (single select)', () => {
  it('shows the placeholder when no value is selected', () => {
    render(
      <Combobox
        options={seniorityOptions}
        value=""
        onChange={vi.fn()}
        placeholder="Any seniority"
      />,
    )

    expect(screen.getByRole('combobox')).toHaveTextContent('Any seniority')
  })

  it("shows the selected option's label", () => {
    render(<Combobox options={seniorityOptions} value="mid" onChange={vi.fn()} />)

    expect(screen.getByRole('combobox')).toHaveTextContent('Mid-level')
  })

  it('calls onChange with the picked value and closes the popover', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Combobox options={seniorityOptions} value="" onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Senior' }))

    expect(onChange).toHaveBeenCalledWith('senior')
    expect(screen.queryByText('Junior')).not.toBeInTheDocument()
  })

  it('deselects when the already-selected option is picked again', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Combobox options={seniorityOptions} value="senior" onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Senior' }))

    expect(onChange).toHaveBeenCalledWith('')
  })
})

describe('Combobox (multiple select)', () => {
  it('shows the placeholder when no values are selected', () => {
    render(
      <Combobox
        multiple
        options={seniorityOptions}
        value={[]}
        onChange={vi.fn()}
        placeholder="Add seniority"
      />,
    )

    expect(screen.getByText('Add seniority')).toBeInTheDocument()
  })

  it('renders a chip per selected value', () => {
    render(
      <Combobox
        multiple
        options={seniorityOptions}
        value={['junior', 'senior']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Junior')).toBeInTheDocument()
    expect(screen.getByText('Senior')).toBeInTheDocument()
  })

  it('removes a value when its chip remove button is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Combobox
        multiple
        options={seniorityOptions}
        value={['junior', 'senior']}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('combobox')
    const removeButton = screen.getByRole('button', { name: 'Remove Junior' })

    expect(trigger).not.toContainElement(removeButton)
    expect(removeButton).toHaveAttribute('data-slot', 'button')

    await user.click(removeButton)

    expect(onChange).toHaveBeenCalledWith(['senior'])
  })

  it('adds a value when an option is picked, and keeps the popover open', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Combobox multiple options={seniorityOptions} value={['junior']} onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Senior' }))

    expect(onChange).toHaveBeenCalledWith(['junior', 'senior'])
  })

  it('offers to create a freeform value when creatable and no option matches the search', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Combobox
        multiple
        creatable
        options={seniorityOptions}
        value={[]}
        onChange={onChange}
        searchPlaceholder="Search seniority"
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search seniority'), 'Staff')
    await user.click(await screen.findByText(/Add "Staff"/))

    expect(onChange).toHaveBeenCalledWith(['Staff'])
  })

  it('does not offer to create a freeform value when not creatable', async () => {
    const user = userEvent.setup()
    render(<Combobox multiple options={seniorityOptions} value={[]} onChange={vi.fn()} />)

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'Staff')

    expect(screen.queryByText(/Add "Staff"/)).not.toBeInTheDocument()
  })

  it('splits one entry into multiple values via normalizeInput', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const normalizeInput = (input: string) =>
      input
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    render(
      <Combobox
        multiple
        creatable
        normalizeInput={normalizeInput}
        options={seniorityOptions}
        value={[]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'Staff, Principal')
    await user.click(await screen.findByText('Add "Staff", "Principal"'))

    expect(onChange).toHaveBeenCalledWith(['Staff', 'Principal'])
  })

  it('is disabled when the disabled prop is set', () => {
    render(<Combobox multiple disabled options={seniorityOptions} value={[]} onChange={vi.fn()} />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('shows the custom empty label when no options match the search', async () => {
    const user = userEvent.setup()
    render(
      <Combobox
        multiple
        options={seniorityOptions}
        value={[]}
        onChange={vi.fn()}
        emptyLabel="No seniority levels match"
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.type(screen.getByPlaceholderText('Search…'), 'zzz')

    expect(await screen.findByText('No seniority levels match')).toBeInTheDocument()
  })
})
