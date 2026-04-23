import { Metadata } from "next";

import { cn } from "@/lib/utils";

const metadataInfo = {
  title: "Privacy Policy – Arbitrum",
  description:
    "Read the official Arbitrum Privacy Policy to understand how we collect, use, and protect your personal information and data when you interact with our services.",
};

export const metadata: Metadata = {
  ...metadataInfo,
};

export default function PrivacyPolicyPage() {
  return (
    <div
      className={cn(
        "pt-22 m-auto px-4 pb-30",
        "[&_a]:underline",
        "[&_li]:my-2 [&_ol]:list-decimal [&_ol]:pl-10",
        "[&_ul]:list-disc [&_ul]:pl-10",
        "lg:max-w-[720px] lg:pb-36 lg:pt-40"
      )}
    >
      <p className="mb-4 text-sm">Last Updated: April 20, 2026</p>
      <h1 className="mb-16 text-3xl leading-extra-tight lg:text-4xl">
        PRIVACY POLICY
      </h1>

      <p className="mb-6 opacity-80">
        This Privacy Policy applies to the processing of personal information by
        The Arbitrum Foundation (
        <strong>&ldquo;Arbitrum Foundation,&rdquo;</strong>{" "}
        <strong>&ldquo;we,&rdquo;</strong> <strong>&ldquo;us,&rdquo;</strong> or{" "}
        <strong>&ldquo;our&rdquo;</strong>) including on our website available
        at{" "}
        <a
          href="https://alt.gov.arbitrum.foundation"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://alt.gov.arbitrum.foundation
        </a>{" "}
        and our other online or offline offerings that link to, or are otherwise
        subject to, this Privacy Policy (collectively, the{" "}
        <strong>&ldquo;Services&rdquo;</strong>).
      </p>

      <h3 className="mb-5 text-xl font-medium">Table of Contents</h3>
      <ol className="mb-6 opacity-80">
        <li>
          <a href="#updates-to-this-privacy-policy">
            UPDATES TO THIS PRIVACY POLICY
          </a>
        </li>
        <li>
          <a href="#personal-information-we-collect">
            PERSONAL INFORMATION WE COLLECT
          </a>
        </li>
        <li>
          <a href="#how-we-use-personal-information">
            HOW WE USE PERSONAL INFORMATION
          </a>
        </li>
        <li>
          <a href="#how-we-share-personal-information">
            HOW WE SHARE PERSONAL INFORMATION
          </a>
        </li>
        <li>
          <a href="#your-privacy-choices-and-rights">
            YOUR PRIVACY CHOICES AND RIGHTS
          </a>
        </li>
        <li>
          <a href="#international-transfers-of-personal-information">
            INTERNATIONAL TRANSFERS OF PERSONAL INFORMATION
          </a>
        </li>
        <li>
          <a href="#retention-of-personal-information">
            RETENTION OF PERSONAL INFORMATION
          </a>
        </li>
        <li>
          <a href="#supplemental-notice-for-eu-uk-gdpr">
            SUPPLEMENTAL NOTICE FOR EU/UK GDPR
          </a>
        </li>
        <li>
          <a href="#childrens-personal-information">
            CHILDREN&rsquo;S PERSONAL INFORMATION
          </a>
        </li>
        <li>
          <a href="#contact-us">CONTACT US</a>
        </li>
      </ol>

      <h3
        id="updates-to-this-privacy-policy"
        className="mb-5 text-xl font-medium"
      >
        1. UPDATES TO THIS PRIVACY POLICY
      </h3>
      <p className="mb-6 opacity-80">
        We may update this Privacy Policy from time to time in our sole
        discretion. If we do, we&rsquo;ll let you know by posting the updated
        Privacy Policy on our website, and we may also send other
        communications.
      </p>

      <h3
        id="personal-information-we-collect"
        className="mb-5 text-xl font-medium"
      >
        2. PERSONAL INFORMATION WE COLLECT
      </h3>
      <p className="mb-6 opacity-80">
        We collect personal information that you provide to us, personal
        information we collect automatically when you use the Services, and
        personal information from third-party sources, as described below.
      </p>

      <strong>(a) Personal Information You Provide to Us Directly</strong>
      <p className="mb-6 mt-2 opacity-80">
        We may collect personal information that you provide to us.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Wallet Information.</strong> In order to use the Services, you
          will need to connect your digital wallet (a{" "}
          <strong>&ldquo;Wallet&rdquo;</strong>). We and our service providers
          may collect personal information and details associated with your
          transactions such as wallet addresses, asset types, and transaction
          history in connection with the Services. Note that your interactions
          with third-party wallet services are subject to each Wallet
          provider&rsquo;s respective privacy policy, not this Privacy Policy.
        </li>
        <li>
          <strong>Your Communications with Us.</strong> We, and our service
          providers, may collect the information you communicate to us, such as
          through email.
        </li>
        <li>
          <strong>Interactive Features.</strong> We and others who use our
          Services may collect personal information and voting information that
          you submit or make available through our interactive features (e.g.,
          messaging features, commenting functionalities, forums, blogs, and
          social media pages). Any information you provide using the public
          sharing features of the Services will be considered
          &ldquo;public.&rdquo;
        </li>
        <li>
          <strong>Governance and Profile Information.</strong> We may collect
          personal information you provide in connection with governance
          participation, such as delegate profiles, Security Council member or
          candidate information, biographies, statements, affiliations, and
          other information submitted through forms or profile features of the
          Services.
        </li>
      </ul>

      <strong>(b) Personal Information Collected Automatically</strong>
      <p className="mb-6 mt-2 opacity-80">
        We may collect personal information automatically when you use the
        Services.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Device Information.</strong> We may collect personal
          information about your device, such as your Internet protocol (IP)
          address, user settings, cookie identifiers, other unique identifiers,
          browser or device information, Internet service provider, and location
          information (including, as applicable, an approximate location derived
          from the IP address and precise geo-location information).
        </li>
        <li>
          <strong>Usage Information.</strong> We may collect personal
          information about your use of the Services, such as the pages that you
          visit, items that you search for, the types of content you interact
          with, information about the links you click, the frequency and
          duration of your activities, and other information about how you use
          the Services.
        </li>
        <li>
          <strong>Cookie Notice (and Other Technologies).</strong> We, as well
          as third parties, may use cookies, pixel tags, and other technologies
          (<strong>&ldquo;Technologies&rdquo;</strong>) to automatically collect
          personal information through your use of the Services.
          <ul>
            <li>
              <strong>Cookies.</strong> Cookies are small text files stored in
              device browsers.
            </li>
            <li>
              <strong>Pixel Tags/Web Beacons.</strong> A pixel tag (also known
              as a web beacon) is a piece of code embedded in the Services that
              collects personal information about use of or engagement with the
              Services. The use of a pixel tag allows us to record, for example,
              that a user has visited a particular web page or clicked on a
              particular advertisement. We may also include web beacons in
              emails to understand whether messages have been opened, acted on,
              or forwarded.
            </li>
          </ul>
          <p className="mt-2 italic">
            See &ldquo;
            <a href="#your-privacy-choices-and-rights">
              Your Privacy Choices and Rights
            </a>
            &rdquo; below to understand your choices regarding these
            Technologies.
          </p>
        </li>
      </ul>

      <strong>(c) Personal Information Collected from Third Parties</strong>
      <ul className="mb-6 mt-2 opacity-80">
        <li>
          <strong>Third-Party Services.</strong> We may collect personal
          information about you from third parties. For example, if you access
          the Services using a third-party website, application, service,
          products, or technology (each a{" "}
          <strong>&ldquo;Third-Party Service&rdquo;</strong>), we may collect
          personal information about you from that Third-Party Service that you
          have made available via your privacy settings.
        </li>
        <li>
          <strong>Blockchain Information.</strong> We may collect personal
          information that is publicly available on the blockchain.
        </li>
      </ul>

      <h3
        id="how-we-use-personal-information"
        className="mb-5 text-xl font-medium"
      >
        3. HOW WE USE PERSONAL INFORMATION
      </h3>
      <p className="mb-6 opacity-80">
        We use personal information for a variety of business purposes,
        including to provide the Services, for administrative purposes, and to
        provide you with marketing materials, as described below.
      </p>

      <strong>(a) Provide the Services</strong>
      <p className="mb-2 mt-2 opacity-80">
        We use personal information to provide the Services, such as:
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          Providing access to certain areas, functionalities, and features of
          the Services;
        </li>
        <li>Communicating with you;</li>
        <li>Answering requests;</li>
        <li>
          Sharing personal information with third parties as needed to provide
          the Services; and
        </li>
        <li>Processing your transaction information.</li>
      </ul>

      <strong>
        (b) Improve the Services and Develop New Products and Services
      </strong>
      <p className="mb-2 mt-2 opacity-80">
        We use personal information to improve the Services and to develop new
        products and services, such as:
      </p>
      <ul className="mb-6 opacity-80">
        <li>Improving, upgrading, or enhancing the Services.</li>
      </ul>

      <strong>(c) Operate Our Business</strong>
      <p className="mb-2 mt-2 opacity-80">
        We use personal information to operate our business, such as:
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          Pursuing our legitimate interests such as direct marketing, research
          and development (including marketing research), network and
          information security, and fraud prevention;
        </li>
        <li>Carrying out analytics;</li>
        <li>Creating de-identified and/or aggregated information;</li>
        <li>Allowing you to register for events;</li>
        <li>Enforcing our agreements and policies; and</li>
        <li>
          Carrying out activities that are required to comply with our legal
          obligations.
        </li>
      </ul>

      <strong>(d) Marketing</strong>
      <p className="mb-2 mt-2 opacity-80">
        We may use personal information in connection with our marketing
        activities including to tailor and to provide you with marketing
        communications, promotions, and offers that may interest you.
      </p>
      <p className="mb-6 opacity-80">
        Some of the ways we market to you include email campaigns and custom
        audiences advertising.
      </p>

      <strong>(e) With Your Consent or Direction</strong>
      <p className="mb-6 mt-2 opacity-80">
        We may use personal information: (i) for other purposes that are clearly
        disclosed to you at the time you provide the personal information, (ii)
        with your consent, or (iii) as otherwise directed by you.
      </p>

      <h3
        id="how-we-share-personal-information"
        className="mb-5 text-xl font-medium"
      >
        4. HOW WE SHARE PERSONAL INFORMATION
      </h3>
      <p className="mb-6 opacity-80">
        We share personal information with third parties for a variety of
        business purposes, including to provide the Services, to protect us or
        others, or in connection with a major business transaction such as a
        merger, sale, or asset transfer, as described below.
      </p>

      <strong>(a) Disclosures to Provide the Services</strong>
      <p className="mb-2 mt-2 opacity-80">
        We may share any of the personal information we collect with the
        categories of third parties described below.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Disclosures to the Blockchain.</strong> Aspects of the
          Services may be hosted on or interact with the blockchain. Where you
          use aspects of the Services that are hosted on or interact with the
          blockchain, information about your interactions and/or transactions
          will be shared with the applicable blockchain network and may be
          accessible to third parties due to the nature of the blockchain
          protocol.
        </li>
        <li>
          <strong>Service Providers.</strong> We may share personal information
          with service providers that assist us with the provision of the
          Services. This may include, but is not limited to, service providers
          that provide us with hosting services, customer service, AI or machine
          learning services, analytics, marketing services, IT support, and
          related services. These Service Providers are generally processors
          acting on our instructions to the extent we are acting as data
          controller. Additionally, a Service Provider may use your personal
          data where it is necessary for compliance with a legal obligation to
          which it is directly subject. The Service Provider, in respect of this
          specific use of personal data acts as a data controller.
        </li>
        <li>
          <strong>Other Users You Share or Interact With.</strong> The Services
          may allow users to share personal information or interact with other
          users of the Services.
        </li>
        <li>
          <strong>Third-Party Services You Share or Interact With.</strong> The
          Services may link to or allow you to interface with, interact with,
          share information with, direct us to share information with, access,
          and/or use a Third-Party Service.
        </li>
      </ul>
      <p className="mb-6 opacity-80">
        Any personal information shared with a Third-Party Service will be
        subject to the Third-Party Service&rsquo;s privacy policy. We are not
        responsible for the processing of personal information by Third-Party
        Services.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Business Partners.</strong> We may share your personal
          information with business partners we work with to provide you with a
          product or service you have requested. We may also share your personal
          information with business partners with whom we jointly offer products
          or services.
        </li>
      </ul>
      <p className="mb-6 opacity-80">
        Once your personal information is shared with our business partner, it
        will also be subject to our business partner&rsquo;s privacy policy. We
        are not responsible for the processing of personal information by our
        business partners.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Affiliates.</strong> We may share your personal information
          with our corporate affiliates.
        </li>
        <li>
          <strong>Advertising Partners.</strong> We may share your personal
          information with third-party advertising partners. These third-party
          advertising partners may set Technologies on our Services to collect
          personal information regarding your activities and your device (e.g.,
          IP address, cookie identifiers, page(s) visited, location, time of
          day). These advertising partners may use this personal information
          (and similar information collected from other services) to tailor and
          deliver personalized ads to you when you visit digital properties
          within their networks. This practice is commonly referred to as
          &ldquo;interest-based advertising,&rdquo; &ldquo;personalized
          advertising,&rdquo; or &ldquo;targeted advertising.&rdquo;
        </li>
      </ul>

      <strong>(b) Disclosures to Protect Us or Others</strong>
      <p className="mb-6 mt-2 opacity-80">
        We may share your personal information and related information with
        external parties if we, in good faith, believe doing so is required or
        appropriate to comply with law enforcement requests, national security
        requests, or other government requests; comply with legal process, such
        as a court order or subpoena; protect your, our, or others&rsquo;
        rights, property, or safety; enforce our policies or contracts; collect
        amounts owed to us; or assist with an investigation or prosecution of
        suspected or actual unauthorized or illegal activity.
      </p>

      <strong>
        (c) Disclosure in the Event of Merger, Sale, or Other Asset Transfers
      </strong>
      <p className="mb-6 mt-2 opacity-80">
        If we are involved in a merger, acquisition, financing, reorganization,
        bankruptcy, receivership, purchase or sale of assets, transition of
        service to another provider, or other similar corporate transaction,
        your personal information may be shared, sold, or transferred as part of
        such a transaction.
      </p>

      <h3
        id="your-privacy-choices-and-rights"
        className="mb-5 text-xl font-medium"
      >
        5. YOUR PRIVACY CHOICES AND RIGHTS
      </h3>
      <p className="mb-2 opacity-80">
        <strong>Your Privacy Choices.</strong> The privacy choices you may have
        about your personal information are described below.
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>Email Communications.</strong> If you receive an unwanted
          email from us, you can use the unsubscribe functionality found at the
          bottom of the email to opt out of receiving future emails. Note that
          you will not be able to opt out of certain communications (e.g.,
          communications regarding the Services or updates to this Privacy
          Policy).
        </li>
        <li>
          <strong>&ldquo;Do Not Track.&rdquo;</strong> Do Not Track (
          <strong>&ldquo;DNT&rdquo;</strong>) is a privacy preference that users
          can set in certain web browsers. Please note that we do not respond to
          or honor DNT signals or similar mechanisms transmitted by web
          browsers.
        </li>
        <li>
          <strong>Cookies.</strong> You may stop or restrict the placement of
          Technologies on your device or remove them by adjusting your
          preferences as your browser or device permits. However, if you adjust
          your preferences, the Services may not work properly.
          <p className="mt-2">
            The online advertising industry also provides mechanisms that may
            allow you to opt out of receiving targeted ads from organizations
            that participate in self-regulatory programs. To learn more, visit
            the{" "}
            <a
              href="http://www.networkadvertising.org/managing/opt_out.asp"
              target="_blank"
              rel="noopener noreferrer"
            >
              Network Advertising Initiative
            </a>
            ,{" "}
            <a
              href="https://youradchoices.com/control"
              target="_blank"
              rel="noopener noreferrer"
            >
              the Digital Advertising Alliance
            </a>
            , and{" "}
            <a
              href="https://www.youronlinechoices.eu/"
              target="_blank"
              rel="noopener noreferrer"
            >
              the European Digital Advertising Alliance
            </a>
            .
          </p>
          <p className="mt-2">
            Please note you must separately opt out in each browser and on each
            device.
          </p>
        </li>
      </ul>

      <p className="mb-2 opacity-80">
        <strong>Your Privacy Rights.</strong> In accordance with applicable law,
        you may have the right to:
      </p>
      <ul className="mb-6 opacity-80">
        <li>
          <strong>
            Request Access to or Portability of Your Personal Information
          </strong>
          ;
        </li>
        <li>
          <strong>Request Correction of Your Personal Information</strong>;
        </li>
        <li>
          <strong>Request Deletion of Your Personal Information</strong>;
        </li>
        <li>
          <strong>
            Request Restriction of or Object to Our Processing of Your Personal
            Information
          </strong>
          ; and
        </li>
        <li>
          <strong>
            Withdraw Your Consent to Our Processing of Your Personal Information
          </strong>
          . Please note that your withdrawal will take effect only for future
          processing and will not affect the lawfulness of processing before the
          withdrawal.
        </li>
      </ul>

      <p className="mb-6 opacity-80">
        If you would like to exercise any of these rights, please contact us as
        set forth in &ldquo;<a href="#contact-us">Contact Us</a>&rdquo; below.
      </p>
      <p className="mb-6 opacity-80">
        We will process such requests in accordance with applicable laws.
      </p>
      <p className="mb-6 opacity-80">
        If your personal information is subject to the applicable data
        protection laws of the European Economic Area or the United Kingdom, you
        have the right to lodge a complaint with the competent supervisory
        authority if you believe that our processing of your personal
        information violates applicable law.
      </p>

      <h3
        id="international-transfers-of-personal-information"
        className="mb-5 text-xl font-medium"
      >
        6. INTERNATIONAL TRANSFERS OF PERSONAL INFORMATION
      </h3>
      <p className="mb-6 opacity-80">
        All personal information processed by us may be transferred, processed,
        and stored anywhere in the world, including, but not limited to, the
        United States or other countries, which may have data protection laws
        that are different from the laws where you live. These countries may or
        may not have adequate data protection laws as defined by the data
        protection authority in your country.
      </p>
      <p className="mb-6 opacity-80">
        If we transfer personal information from the European Economic Area,
        Switzerland, and/or the United Kingdom to a country that does not
        provide an adequate level of protection under applicable data protection
        laws, one of the safeguards we may use to support such transfer is the{" "}
        <a
          href="https://commission.europa.eu/system/files/2021-06/1_en_annexe_acte_autonome_cp_part1_v5_0.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          EU Standard Contractual Clauses
        </a>
        .
      </p>
      <p className="mb-6 opacity-80">
        For more information about the safeguards we use for international
        transfers of your personal information, please contact us as set forth
        below.
      </p>

      <h3
        id="retention-of-personal-information"
        className="mb-5 text-xl font-medium"
      >
        7. RETENTION OF PERSONAL INFORMATION
      </h3>
      <p className="mb-6 opacity-80">
        We store the personal information we collect as described in this
        Privacy Policy for as long as you use the Services, or as long as
        necessary to fulfill the purpose(s) for which it was collected, or as
        long as necessary to pursue our business purposes.
      </p>
      <p className="mb-6 opacity-80">
        To determine the appropriate retention period for personal information,
        we may consider applicable legal requirements; the amount, nature, and
        sensitivity of the personal information; certain risk factors; the
        purposes for which we process your personal information; and whether we
        can achieve those purposes through other means.
      </p>

      <h3
        id="supplemental-notice-for-eu-uk-gdpr"
        className="mb-5 text-xl font-medium"
      >
        8. SUPPLEMENTAL NOTICE FOR EU/UK GDPR
      </h3>
      <p className="mb-6 opacity-80">
        This Supplemental Notice for EU/UK GDPR applies only to our processing
        of personal information that is subject to the EU or UK General Data
        Protection Regulation.
      </p>
      <p className="mb-6 opacity-80">
        In some cases, providing personal information may be a requirement under
        applicable law, a contractual requirement, or a requirement necessary to
        enter into a contract. If you choose not to provide personal information
        in cases where it is required, we will inform you of the consequences at
        the time of your refusal to provide the personal information.
      </p>
      <p className="mb-6 opacity-80">
        Arbitrum Foundation&rsquo;s processing of your personal information may
        be supported by one or more of the following lawful bases:
      </p>

      <div className="mb-6 overflow-x-auto opacity-80">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className="border p-2 font-semibold">
                Privacy Policy Section
              </th>
              <th className="border p-2 font-semibold">
                Lawful Basis: Performance of a Contract (i.e., to provide the
                Services to you)
              </th>
              <th className="border p-2 font-semibold">
                Lawful Basis: Legitimate Interest
              </th>
              <th className="border p-2 font-semibold">
                Lawful Basis: Consent
              </th>
              <th className="border p-2 font-semibold">
                Lawful Basis: For Compliance with Legal Obligations
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-2 font-semibold">
                Section 3A: Provide the Services
              </td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
            </tr>
            <tr>
              <td className="border p-2 font-semibold">
                Section 3B: Improve the Services and Develop New Products
              </td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
            </tr>
            <tr>
              <td className="border p-2 font-semibold">
                Section 3C: Operate Our Business
              </td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
            </tr>
            <tr>
              <td className="border p-2 font-semibold">
                Section 3D: Marketing
              </td>
              <td className="border p-2 text-center"></td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center"></td>
            </tr>
            <tr>
              <td className="border p-2 font-semibold">
                Section 3E: With Your Consent or Direction
              </td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center font-semibold">✔</td>
              <td className="border p-2 text-center"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3
        id="childrens-personal-information"
        className="mb-5 text-xl font-medium"
      >
        9. CHILDREN&rsquo;S PERSONAL INFORMATION
      </h3>
      <p className="mb-6 opacity-80">
        The Services are not directed to children under 18 (or other age as
        required by local law outside the United States), and we do not
        knowingly collect personal information from children.
      </p>
      <p className="mb-6 opacity-80">
        If you are a parent or guardian and believe that your child has uploaded
        personal information to the Services in violation of applicable law, you
        may contact us as described in &ldquo;
        <a href="#contact-us">Contact Us</a>&rdquo; below.
      </p>

      <h3 id="contact-us" className="mb-5 text-xl font-medium">
        10. CONTACT US
      </h3>
      <p className="mb-6 opacity-80">
        If you have any questions about our privacy practices or this Privacy
        Policy, or to exercise your rights as detailed in this Privacy Policy,
        please contact us at:{" "}
        <a href="mailto:info@arbitrum.foundation">info@arbitrum.foundation</a>.
      </p>
    </div>
  );
}
