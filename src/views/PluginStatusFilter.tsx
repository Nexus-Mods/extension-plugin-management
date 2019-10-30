import { types } from 'vortex-api';

import * as React from 'react';
import Select from 'react-select';

function nop() {
  return '';
}

export class PluginStatusFilterComponent extends React.Component<types.IFilterProps, {}> {
  public render(): JSX.Element {
    const { filter } = this.props;

    const currentFilters = [
      { label: 'Enabled', value: 'Enabled' },
      { label: 'Disabled', value: 'Disabled' },
      { label: 'Loaded by engine', value: 'undefined' },
    ];

    return (
    <Select
      className='select-compact'
      options={currentFilters}
      value={filter || ''}
      onChange={this.changeFilter}
      searchable={false}
      onInputChange={nop}
    />);
  }

  private changeFilter = (value: { value: string, label: string }) => {
    const { attributeId, onSetFilter } = this.props;
    onSetFilter(attributeId, value !== null ? value.value : null);
  }
}

class PluginStatusFilter implements types.ITableFilter {
  public component = PluginStatusFilterComponent;
  public raw = false;

  public matches(filter: any, value: any): boolean {
    if (filter === 'undefined') {
      return value === undefined;
    } else {
      return value === filter;
    }
  }
}

export default PluginStatusFilter;
