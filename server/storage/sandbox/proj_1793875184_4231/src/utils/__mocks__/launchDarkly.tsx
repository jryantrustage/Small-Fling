import * as repo from '../launchDarkly';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };
const launchDarklyMock = jest.createMockFromModule(
'../launchDarkly',
) as Writeable<typeof repo>;

launchDarklyMock.useGetFeatureFlags = () => true;

module.exports = launchDarklyMock;
