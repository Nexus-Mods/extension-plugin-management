function transformRules(rules: CSSStyleRule[]): { [id: string]: any } {
  return rules
    .filter(rule => (rule.selectorText !== undefined) && rule.selectorText.startsWith('#variable'))
    .reduce((prev, rule) => {
      const [id, type, key] = rule.selectorText.split(' ');
      prev[key.slice(1)] = rule.style[type.slice(1)];
      return prev;
    }, {});
}

export default function(rules: CSSStyleRule[]) {
  const variables = transformRules(rules);

  return [
    {
      selector: 'node',
      style: {
        'background-color': variables['brand-bg'],
        label: 'data(title)',
        'text-background-color': variables['white'],
        'text-background-opacity': 1,
      },
    },
    {
      selector: 'node.masterlist',
      style: {
        'background-blacken': -0.5,
      },
    },
    {
      selector: 'node[[indegree = 0]][[outdegree > 0]]',
      style: {
        'background-color': variables['brand-highlight'],
      },
    },
    {
      selector: 'node[[outdegree = 0]][[indegree > 0]]',
      style: {
        'background-color': variables['brand-success'],
      },
    },
    {
      selector: 'edge',
      style: {
        width: 2,
        'curve-style': 'bezier',
        'mid-target-arrow-shape': 'triangle',
        'arrow-scale': 1.25,
        'target-endpoint': 'inside-to-node',
      },
    },
    {
      selector: 'edge.masterlist',
      style: {
        'line-color': variables['text-color-disabled'],
        'mid-target-arrow-color': variables['text-color-disabled'],
      },
    },
    {
      selector: 'edge.userlist',
      style: {
        'line-color': variables['text-color'],
        'mid-target-arrow-color': variables['text-color'],
      },
    },
    {
      selector: 'node.eh-handle',
      style: {
        label: '',
        'background-color': variables['brand-primary'],
        height: 10,
        width: 10,
      },
    },
  ];
}
