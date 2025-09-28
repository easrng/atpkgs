import { Header } from "../../components/Header";
import {
	type GenericUri,
	type Handle,
	type InferOutput,
	parse,
} from "@atcute/lexicons";
import { type MiniDoc, resolveMiniDoc } from "../../../lib/resolve-mini-doc";
import { async } from "../../load";
import { Client, simpleFetchHandler } from "@atcute/client";
import { AppBskyActorProfile } from "@atcute/bluesky";
import fallbackAvatar from "../../assets/fallback-avatar.svg?url";
import type {} from "@atcute/atproto";
import "./style.css";
import { Title } from "../../components/Title";
import { CircleUserRound, Globe, Tag } from "lucide-preact";
import type { SessionData } from "../..";

const ProfilePageInner = (
	{ doc, avatarUri, displayName, pronouns, website }: {
		doc: MiniDoc;
		originalHandle: Handle;
		avatarUri: string;
		displayName: string | undefined;
		pronouns: string | undefined;
		website: GenericUri | undefined;
	},
) => {
	return (
		<div class="page page-profile">
			<Title>
				{`@${doc.handle}'s packages`}
			</Title>
			<Header searchValue={"@" + doc.handle} />
			<main>
				<div class="user-info">
					<img src={avatarUri} class="avatar" alt="" />
					<div class="user-info-text">
						<h2>@{doc.handle}'s packages</h2>
						{displayName && (
							<div class="display-name">
								<CircleUserRound /> {displayName}
							</div>
						)}
						{pronouns && (
							<div class="pronouns">
								<Tag /> {pronouns}
							</div>
						)}
						{website && (
							<div class="website">
								<Globe />{" "}
								<a href={website}>
									{website}
								</a>
							</div>
						)}
					</div>
				</div>
			</main>
		</div>
	);
};

export const ProfilePage = async (
	{ handle, $session, $route }: {
		handle: Handle;
		$session: SessionData;
		$route: (url: string, replace: boolean) => void;
	},
) => {
	const doc = await resolveMiniDoc(
		{ identifier: handle },
		await $session.rpc,
	);
	const client = new Client({
		handler: simpleFetchHandler({ service: doc.pds }),
	});
	const profileResponse = await client.get("com.atproto.repo.getRecord", {
		params: {
			repo: doc.did,
			collection: "app.bsky.actor.profile",
			rkey: "self",
		},
	});
	const profile: Pick<
		InferOutput<AppBskyActorProfile.mainSchema>,
		"avatar" | "displayName" | "pronouns" | "website"
	> = profileResponse.ok
		? parse(AppBskyActorProfile.mainSchema, profileResponse.data.value)
		: {};
	const avatarCid = profile.avatar?.ref.$link;
	if (doc.handle !== handle) {
		$route("/@" + doc.handle, true);
	}
	return (
		<ProfilePageInner
			avatarUri={avatarCid
				? doc.pds +
					`/xrpc/com.atproto.sync.getBlob?did=${doc.did}&cid=${avatarCid}`
				: fallbackAvatar}
			displayName={profile.displayName}
			doc={doc}
			originalHandle={handle}
			pronouns={profile.pronouns}
			website={profile.website}
		/>
	);
};
